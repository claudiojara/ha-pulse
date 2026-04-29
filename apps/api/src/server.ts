import cors from '@fastify/cors';
import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  StateChangedEvent,
} from '@dashboard-web/shared';
import { config } from './config.js';
import { type HaClient, createHaClient } from './ha/client.js';
import { throttleByKey } from './util/throttle.js';

async function main(): Promise<void> {
  const fastify = Fastify({
    logger: { level: config.log.level },
  });

  await fastify.register(cors, {
    origin: config.cors.allowedOrigins,
    credentials: true,
  });

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

  io.on('connection', async (socket) => {
    fastify.log.info({ socketId: socket.id }, '[ws] cliente conectado');

    try {
      const states = await ha.getAllStates();
      socket.emit('initial_states', states);
      socket.emit('connection_status', {
        connected: true,
        haReachable: ha.isConnected(),
        lastSync: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error({ err }, '[ws] no se pudo enviar initial_states');
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

    socket.on('disconnect', () => {
      fastify.log.info({ socketId: socket.id }, '[ws] cliente desconectado');
    });
  });

  // Cierre limpio
  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info(`Recibido ${signal}, cerrando...`);
    disposeHaListener();
    ha.close();
    io.close();
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
