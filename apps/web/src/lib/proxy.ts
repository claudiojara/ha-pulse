/**
 * Helpers para construir URLs del proxy del backend para imágenes/streams.
 * El backend tiene allowlist y agrega Authorization: Bearer al HA si corresponde.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function cameraStreamUrl(entityId: string): string {
  return `${API_BASE}/api/proxy/camera-stream/${encodeURIComponent(entityId)}`;
}

export function cameraSnapshotUrl(entityId: string): string {
  return `${API_BASE}/api/proxy/camera-snapshot/${encodeURIComponent(entityId)}`;
}

/**
 * Resuelve la URL pública de una entity_picture pasándola por el proxy.
 * Acepta paths relativos al HA (`/api/...`) o URLs absolutas (allowlist en backend).
 */
export function entityPictureUrl(entityPicture: string | undefined): string | undefined {
  if (!entityPicture) return undefined;
  const param = entityPicture.startsWith('/') ? 'path' : 'url';
  return `${API_BASE}/api/proxy/image?${param}=${encodeURIComponent(entityPicture)}`;
}
