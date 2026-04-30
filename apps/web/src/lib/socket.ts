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

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: AppSocket | null = null;

/**
 * Devuelve el socket compartido. Lazy init: la conexión se abre al primer uso,
 * no al importar el módulo (a diferencia de HAWeb donde se conectaba en el import).
 */
export function getSocket(): AppSocket {
  if (!socketInstance) {
    socketInstance = io(API_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
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
