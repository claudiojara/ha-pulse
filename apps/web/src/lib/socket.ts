import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ServiceCallPayload,
  SetHiddenPayload,
  SetOverridePayload,
  SetPrefPayload,
  SetRoomLayoutPayload,
} from '@dashboard-web/shared';
import { type Socket, io } from 'socket.io-client';

/**
 * Dev: VITE_API_URL apunta al backend en otro origen (ej. http://localhost:3001).
 * Prod: undefined → mismo origen que el documento. El path de Socket.IO se
 * deriva de `window.location.pathname` para respetar el prefijo de Ingress
 * (`/api/hassio_ingress/<token>/`) si lo hay; en standalone (Docker compose,
 * file:// no existe) el directorio es simplemente `/`.
 */
const API_URL = import.meta.env.VITE_API_URL as string | undefined;

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: AppSocket | null = null;

function documentBaseDir(): string {
  // Path del directorio del documento, con trailing slash. Ejemplos:
  //   '/'                                    → '/'
  //   '/api/hassio_ingress/abc123/'          → '/api/hassio_ingress/abc123/'
  //   '/api/hassio_ingress/abc123/index.html' → '/api/hassio_ingress/abc123/'
  return window.location.pathname.replace(/[^/]*$/, '');
}

export function getSocket(): AppSocket {
  if (!socketInstance) {
    if (API_URL) {
      socketInstance = io(API_URL, {
        autoConnect: true,
        transports: ['websocket', 'polling'],
      });
    } else {
      const dir = documentBaseDir();
      socketInstance = io({
        autoConnect: true,
        transports: ['websocket', 'polling'],
        path: `${dir}socket.io/`,
      });
    }
  }
  return socketInstance;
}

export function callService(payload: ServiceCallPayload): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    getSocket().emit('call_service', payload, resolve);
  });
}

export function setHiddenPref(payload: SetHiddenPayload): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    getSocket().emit('set_hidden', payload, resolve);
  });
}

export function setOverridePref(payload: SetOverridePayload): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    getSocket().emit('set_override', payload, resolve);
  });
}

export function setRoomLayoutPref(
  payload: SetRoomLayoutPayload,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    getSocket().emit('set_room_layout', payload, resolve);
  });
}

export function setUserPref(payload: SetPrefPayload): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    getSocket().emit('set_pref', payload, resolve);
  });
}

export function chatSend(text: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    getSocket().emit('chat_send', text, resolve);
  });
}

export function chatReset(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    getSocket().emit('chat_reset', resolve);
  });
}
