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

loadDotenv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable de entorno requerida: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  ha: {
    url: required('HA_URL'),
    token: required('HA_TOKEN'),
  },
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
  },
} as const;

export type AppConfig = typeof config;
