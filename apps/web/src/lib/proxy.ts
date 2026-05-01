/**
 * Helpers para construir URLs del proxy del backend para imágenes/streams.
 * El backend tiene allowlist y agrega Authorization: Bearer al HA si corresponde.
 *
 * Dev: VITE_API_URL apunta al backend en otro origen (ej. http://localhost:3001).
 * Prod: undefined → mismo origen. Usamos el directorio del documento como
 * prefijo para que las URLs respeten el path de Ingress de HA.
 */

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

function apiBase(): string {
  if (API_URL) return API_URL;
  // documentBaseDir trae trailing slash; las funciones de abajo agregan '/api/...'
  // así que strip-eamos el trailing slash para no duplicar.
  return window.location.pathname.replace(/[^/]*$/, '').replace(/\/$/, '');
}

export function cameraStreamUrl(entityId: string): string {
  return `${apiBase()}/api/proxy/camera-stream/${encodeURIComponent(entityId)}`;
}

export function cameraSnapshotUrl(entityId: string): string {
  return `${apiBase()}/api/proxy/camera-snapshot/${encodeURIComponent(entityId)}`;
}

/**
 * Resuelve la URL pública de una entity_picture pasándola por el proxy.
 * Acepta paths relativos al HA (`/api/...`) o URLs absolutas (allowlist en backend).
 */
export function entityPictureUrl(entityPicture: string | undefined): string | undefined {
  if (!entityPicture) return undefined;
  const param = entityPicture.startsWith('/') ? 'path' : 'url';
  return `${apiBase()}/api/proxy/image?${param}=${encodeURIComponent(entityPicture)}`;
}
