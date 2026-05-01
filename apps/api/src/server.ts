import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import type {
  Area,
  ClientToServerEvents,
  ServerToClientEvents,
  StateChangedEvent,
} from '@dashboard-web/shared';
import { config } from './config.js';
import { createChatRunner, disposeChatSession } from './chat/handler.js';
import { createPrefsDb } from './db/db.js';
import { type HaClient, createHaClient } from './ha/client.js';
import { registerProxyRoutes } from './proxy.js';
import { throttleByKey } from './util/throttle.js';

async function main(): Promise<void> {
  const fastify = Fastify({
    logger: { level: config.log.level },
  });

  await fastify.register(cors, {
    origin: config.cors.allowedOrigins,
    credentials: true,
  });

  fastify.log.info(`[config] modo ${config.ha.mode} — HA en ${config.ha.url}`);
  fastify.log.info(`Conectando a Home Assistant en ${config.ha.url}...`);
  const ha: HaClient = await createHaClient({
    url: config.ha.url,
    token: config.ha.token,
    onConnected: () => {
      fastify.log.info('[HA] reconectado');
      io.emit('connection_status', {
        connected: true,
        haReachable: true,
        lastSync: new Date().toISOString(),
      });
    },
    onDisconnected: () => {
      fastify.log.warn('[HA] desconectado');
      io.emit('connection_status', {
        connected: true,
        haReachable: false,
        lastSync: null,
      });
    },
  });
  fastify.log.info('[HA] conectado');

  fastify.get('/api/health', async () => ({
    status: 'ok',
    ha: ha.isConnected() ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  }));

  fastify.get('/api/areas', async (): Promise<{ areas: Area[] }> => {
    const areas = await ha.getAllAreas();
    return { areas };
  });

  const prefsDb = createPrefsDb(config.db.path);
  fastify.log.info(`[db] preferencias en ${config.db.path}`);

  fastify.get('/api/preferences', async () => prefsDb.getSnapshot());

  registerProxyRoutes(fastify);

  const chatRunner = createChatRunner({ ha, db: prefsDb });
  if (chatRunner) {
    fastify.log.info('[chat] habilitado (auto-switch haiku/sonnet 4.5/4.6)');
  } else {
    fastify.log.warn('[chat] deshabilitado: ANTHROPIC_API_KEY no seteada');
  }

  // Servir frontend buildeado si existe (prod / docker / HA add-on).
  // En dev (pnpm dev) la dist no existe — Vite corre aparte en :5173.
  const webDistPath = resolve(process.cwd(), config.web.distPath);
  if (existsSync(webDistPath)) {
    await fastify.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      wildcard: false,
    });
    fastify.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
    fastify.log.info(`[web] sirviendo statics desde ${webDistPath}`);
  } else {
    fastify.log.info(`[web] sin frontend buildeado en ${webDistPath} — modo API-only`);
  }

  // Levantamos primero Fastify para tener el server HTTP listo, después montamos Socket.IO encima.
  await fastify.listen({ port: config.server.port, host: config.server.host });
  fastify.log.info(
    `API escuchando en http://${config.server.host}:${config.server.port}`,
  );

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(fastify.server, {
    cors: {
      origin: config.cors.allowedOrigins,
      credentials: true,
    },
  });

  // Throttle de state_changed por entity_id
  const broadcastStateChanged = throttleByKey<StateChangedEvent>(
    config.throttle.stateChangedMs,
    (event) => io.emit('state_changed', event),
  );

  const disposeHaListener = ha.onStateChanged((event) => {
    broadcastStateChanged(event.entity_id, event);
  });

  const disposeAreasListener = ha.onAreasUpdated((areas) => {
    io.emit('areas_updated', areas);
  });

  const disposeEntityAreasListener = ha.onEntityAreasUpdated((map) => {
    io.emit('entity_areas_updated', map);
  });

  const broadcastPrefs = (): void => {
    io.emit('preferences_updated', prefsDb.getSnapshot());
  };

  io.on('connection', async (socket) => {
    fastify.log.info({ socketId: socket.id }, '[ws] cliente conectado');

    try {
      const [states, areas, entityAreas] = await Promise.all([
        ha.getAllStates(),
        ha.getAllAreas(),
        ha.getEntityAreaMap(),
      ]);
      socket.emit('initial_states', states);
      socket.emit('initial_areas', areas);
      socket.emit('initial_entity_areas', entityAreas);
      socket.emit('initial_preferences', prefsDb.getSnapshot());
      if (chatRunner) {
        socket.emit('initial_chat_history', chatRunner.loadHistoryItems(socket.id));
      }
      socket.emit('connection_status', {
        connected: true,
        haReachable: ha.isConnected(),
        lastSync: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error({ err }, '[ws] no se pudo enviar snapshot inicial');
    }

    socket.on('call_service', async (payload, ack) => {
      try {
        await ha.callService(payload);
        ack({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        fastify.log.error({ err, payload }, '[ws] call_service falló');
        ack({ ok: false, error: message });
      }
    });

    socket.on('set_hidden', (payload, ack) => {
      try {
        prefsDb.setHidden(payload.entity_id, payload.hidden);
        broadcastPrefs();
        ack({ ok: true });
      } catch (err) {
        ack({ ok: false, error: err instanceof Error ? err.message : 'unknown' });
      }
    });

    socket.on('set_override', (payload, ack) => {
      try {
        prefsDb.setOverride({
          entity_id: payload.entity_id,
          custom_name: payload.custom_name ?? null,
          custom_icon: payload.custom_icon ?? null,
        });
        broadcastPrefs();
        ack({ ok: true });
      } catch (err) {
        ack({ ok: false, error: err instanceof Error ? err.message : 'unknown' });
      }
    });

    socket.on('set_room_layout', (payload, ack) => {
      try {
        prefsDb.setRoomLayout(payload.area_id, payload.entity_order);
        broadcastPrefs();
        ack({ ok: true });
      } catch (err) {
        ack({ ok: false, error: err instanceof Error ? err.message : 'unknown' });
      }
    });

    socket.on('set_pref', (payload, ack) => {
      try {
        prefsDb.setPref(payload.key, payload.value);
        broadcastPrefs();
        ack({ ok: true });
      } catch (err) {
        ack({ ok: false, error: err instanceof Error ? err.message : 'unknown' });
      }
    });

    socket.on('chat_send', async (text, ack) => {
      if (!chatRunner) {
        ack({ ok: false, error: 'chat deshabilitado: API key no configurada' });
        return;
      }
      try {
        ack({ ok: true });
        await chatRunner.send(text, socket);
      } catch (err) {
        socket.emit(
          'chat_error',
          err instanceof Error ? err.message : 'unknown chat error',
        );
      }
    });

    socket.on('chat_reset', (ack) => {
      if (chatRunner) chatRunner.reset(socket);
      ack({ ok: true });
    });

    socket.on('disconnect', () => {
      fastify.log.info({ socketId: socket.id }, '[ws] cliente desconectado');
      disposeChatSession(socket.id);
    });
  });

  // Cierre limpio
  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info(`Recibido ${signal}, cerrando...`);
    disposeHaListener();
    disposeAreasListener();
    disposeEntityAreasListener();
    ha.close();
    io.close();
    prefsDb.close();
    await fastify.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fallo al iniciar el servidor:', err);
  process.exit(1);
});
