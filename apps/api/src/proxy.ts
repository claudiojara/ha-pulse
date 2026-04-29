import type { FastifyInstance, FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { config } from './config.js';

const HOPBYHOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

const ALLOWED_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'cache-control',
  'last-modified',
  'etag',
  'expires',
]);

function haHostKey(): string {
  // host:port (port explícito si lo hay) — usamos URL para parsear robusto.
  const u = new URL(config.ha.url);
  return `${u.host}`.toLowerCase();
}

function isHostAllowed(targetUrl: URL): boolean {
  const host = targetUrl.host.toLowerCase();
  if (host === haHostKey()) return true;
  return config.proxy.extraImageHosts.some((h) => h.toLowerCase() === host);
}

async function streamUpstream(
  upstream: Response,
  reply: FastifyReply,
): Promise<void> {
  reply.code(upstream.status);
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (HOPBYHOP_HEADERS.has(lower)) continue;
    if (!ALLOWED_RESPONSE_HEADERS.has(lower)) continue;
    reply.header(key, value);
  }
  if (!upstream.body) {
    await reply.send(null);
    return;
  }
  // Convertir Web ReadableStream a Node Readable.
  const nodeStream = Readable.fromWeb(upstream.body as never);
  await reply.send(nodeStream);
}

export function registerProxyRoutes(fastify: FastifyInstance): void {
  /**
   * MJPEG stream en vivo de una cámara HA. El browser puede consumirlo
   * directo en `<img src=...>` (HA devuelve multipart/x-mixed-replace).
   */
  fastify.get<{ Params: { entityId: string } }>(
    '/api/proxy/camera-stream/:entityId',
    async (req, reply) => {
      const { entityId } = req.params;
      if (!entityId.startsWith('camera.')) {
        return reply.code(400).send({ error: 'invalid entity_id' });
      }
      const url = `${config.ha.url}/api/camera_proxy_stream/${encodeURIComponent(entityId)}`;
      const upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${config.ha.token}` },
      });
      if (!upstream.ok) {
        return reply.code(upstream.status).send({ error: upstream.statusText });
      }
      await streamUpstream(upstream, reply);
    },
  );

  /**
   * Snapshot estático de una cámara HA. Útil para previews o como fallback
   * si MJPEG no está disponible.
   */
  fastify.get<{ Params: { entityId: string } }>(
    '/api/proxy/camera-snapshot/:entityId',
    async (req, reply) => {
      const { entityId } = req.params;
      if (!entityId.startsWith('camera.')) {
        return reply.code(400).send({ error: 'invalid entity_id' });
      }
      const url = `${config.ha.url}/api/camera_proxy/${encodeURIComponent(entityId)}`;
      const upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${config.ha.token}` },
      });
      if (!upstream.ok) {
        return reply.code(upstream.status).send({ error: upstream.statusText });
      }
      await streamUpstream(upstream, reply);
    },
  );

  /**
   * Proxy de imágenes arbitrarias (artwork de media_player, etc).
   * Acepta dos formas:
   *   ?path=/api/media_player_proxy/...   (relative al HA)
   *   ?url=https://host/path              (absoluta; debe estar en allowlist)
   *
   * Razón de existir: el browser está en localhost:5173 y el HA puede estar
   * accesible solo via Tailscale, o el artwork puede venir de un host interno
   * (Music Assistant en :8095). Necesitamos proxar para evitar CORS y para
   * reachability.
   */
  fastify.get<{ Querystring: { path?: string; url?: string } }>(
    '/api/proxy/image',
    async (req, reply) => {
      const { path, url: rawUrl } = req.query;
      let target: URL;
      let useBearer = false;

      if (path) {
        if (!path.startsWith('/')) {
          return reply.code(400).send({ error: 'path must start with /' });
        }
        target = new URL(path, config.ha.url);
        useBearer = true;
      } else if (rawUrl) {
        try {
          target = new URL(rawUrl);
        } catch {
          return reply.code(400).send({ error: 'invalid url' });
        }
        if (!isHostAllowed(target)) {
          return reply.code(403).send({ error: 'host not allowed' });
        }
        // Si la URL apunta al HA mismo, agregamos auth.
        useBearer = target.host.toLowerCase() === haHostKey();
      } else {
        return reply.code(400).send({ error: 'missing path or url' });
      }

      const headers: Record<string, string> = {};
      if (useBearer) headers.Authorization = `Bearer ${config.ha.token}`;

      const upstream = await fetch(target, { headers });
      if (!upstream.ok) {
        return reply.code(upstream.status).send({ error: upstream.statusText });
      }
      await streamUpstream(upstream, reply);
    },
  );
}
