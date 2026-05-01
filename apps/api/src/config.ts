import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotenv(): void {
  try {
    const path = resolve(process.cwd(), '.env');
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env opcional: si no existe, asumimos que las vars vienen del shell (Keychain via ha-dev.sh)
  }
}

/**
 * En modo add-on (supervised), HA Supervisor escribe `/data/options.json` con
 * los valores que el usuario configuró en la UI del add-on (campo `options` del
 * `config.yaml`). Acá los mapeamos a env vars para que el resto del código las
 * use con la misma semántica que en dev. Las env vars del shell siguen ganando
 * — útil para forzar un override en debugging puntual desde SSH al add-on.
 */
function loadAddonOptions(): void {
  try {
    const content = readFileSync('/data/options.json', 'utf-8');
    const opts: Record<string, unknown> = JSON.parse(content);
    const mapping: Record<string, string> = {
      log_level: 'LOG_LEVEL',
      anthropic_api_key: 'ANTHROPIC_API_KEY',
      anthropic_model: 'ANTHROPIC_MODEL',
    };
    for (const [optKey, envKey] of Object.entries(mapping)) {
      const v = opts[optKey];
      if (v === undefined || v === null || v === '') continue;
      if (process.env[envKey] === undefined) process.env[envKey] = String(v);
    }
  } catch {
    // /data/options.json no existe → modo standalone (Docker compose / dev)
  }
}

loadAddonOptions();
loadDotenv();

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type HaMode = 'standalone' | 'supervised';

export interface HaConfig {
  url: string;
  token: string;
  mode: HaMode;
}

/**
 * Resuelve la conexión a Home Assistant en uno de dos modos:
 *
 * - **supervised**: corremos como add-on de HA OS / Supervised. El Supervisor
 *   inyecta `SUPERVISOR_TOKEN` con scope a la API de HA. La URL es interna
 *   (`http://supervisor/core`) y NO requiere `HA_URL`/`HA_TOKEN`.
 * - **standalone**: corremos en una Mac, mini-server, docker compose, etc.
 *   Requiere `HA_URL` y `HA_TOKEN` (long-lived access token) en env.
 *
 * Si `SUPERVISOR_TOKEN` existe, gana — los HA_* del env se ignoran. Esto evita
 * configuraciones híbridas confusas adentro del add-on.
 */
export function resolveHaConfig(env: NodeJS.ProcessEnv): HaConfig {
  const supervisorToken = env.SUPERVISOR_TOKEN;
  if (supervisorToken) {
    return {
      url: 'http://supervisor/core',
      token: supervisorToken,
      mode: 'supervised',
    };
  }
  const url = env.HA_URL;
  const token = env.HA_TOKEN;
  if (!url) {
    throw new Error(
      'Variable de entorno requerida: HA_URL (o SUPERVISOR_TOKEN para modo supervised)',
    );
  }
  if (!token) {
    throw new Error(
      'Variable de entorno requerida: HA_TOKEN (o SUPERVISOR_TOKEN para modo supervised)',
    );
  }
  return { url, token, mode: 'standalone' };
}

export const config = {
  ha: resolveHaConfig(process.env),
  server: {
    port: optionalInt('PORT', 3001),
    host: optional('HOST', '0.0.0.0'),
  },
  cors: {
    allowedOrigins: optional('ALLOWED_ORIGINS', 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  log: {
    level: optional('LOG_LEVEL', 'info'),
  },
  throttle: {
    stateChangedMs: optionalInt('STATE_THROTTLE_MS', 100),
  },
  proxy: {
    /**
     * Hosts adicionales (host:port) permitidos para proxy de imágenes.
     * El host del HA siempre está implícitamente permitido.
     * Útil para Music Assistant u otros plugins que sirven artwork desde otra URL.
     */
    extraImageHosts: optional('IMAGE_PROXY_EXTRA_HOSTS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /**
     * Máximo de streams MJPEG concurrentes por cámara. Más viewers que esto
     * sobre el mismo entity_id reciben 429; el frontend cae a snapshot polling.
     */
    cameraMaxStreamsPerEntity: optionalInt('CAMERA_MAX_STREAMS_PER_ENTITY', 3),
    /**
     * `Cache-Control: max-age=N` en segundos para snapshots de cámara. 2s es
     * razonable para snapshot polling: el browser revalida con `If-Modified-Since`,
     * HA puede devolver 304 si no cambió, evitando re-encode.
     */
    cameraSnapshotMaxAge: optionalInt('CAMERA_SNAPSHOT_MAX_AGE', 2),
  },
  db: {
    /**
     * Path al SQLite de preferencias.
     *
     * - **supervised** (add-on de HA): forzamos `/data/prefs.db`, el directorio
     *   que el Supervisor monta como persistente y que el sistema de backups
     *   incluye automáticamente. El env var PREFS_DB_PATH se ignora en este
     *   modo a propósito — la decisión es de operativa, no del usuario.
     * - **standalone** (Docker compose o dev): respeta `PREFS_DB_PATH` si está
     *   seteado (en compose se setea `/app/data/prefs.db`, montado en `./data`).
     *   Si no, default `./data/prefs.db` relativo al cwd del proceso (apps/api).
     */
    path: process.env.SUPERVISOR_TOKEN
      ? '/data/prefs.db'
      : optional('PREFS_DB_PATH', './data/prefs.db'),
  },
  web: {
    /**
     * Path al `dist/` del frontend buildeado. Si existe, el API lo sirve como
     * statics + SPA fallback en `/`. Si no existe, modo API-only (dev: Vite
     * corre aparte en :5173).
     *
     * Default `'../web/dist'` resuelto desde el cwd del proceso (apps/api).
     * En el contenedor se override a path absoluto (ej. `/app/apps/web/dist`).
     */
    distPath: optional('WEB_DIST_PATH', '../web/dist'),
  },
  anthropic: {
    /** API key para chat con Claude (Fase 4). Vacío = chat deshabilitado. */
    apiKey: optional('ANTHROPIC_API_KEY', ''),
    /** Modelo default. Sonnet 4.6 — balance speed/intelligence para tool-use HA. */
    model: optional('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
  },
} as const;

export type AppConfig = typeof config;
