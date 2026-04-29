import WebSocket from 'ws';
import {
  type Connection,
  callService as haCallService,
  createConnection,
  createLongLivedTokenAuth,
  getStates,
} from 'home-assistant-js-websocket';
import type {
  HassEntity,
  ServiceCallPayload,
  StateChangedEvent,
} from '@dashboard-web/shared';

// home-assistant-js-websocket usa WebSocket del entorno global. En Node hay que polyfill-earlo.
// Asignamos antes de cualquier import del Connection — por eso el monkey-patch al top.
(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

export interface HaClientOptions {
  url: string;
  token: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export type StateChangedListener = (event: StateChangedEvent) => void;

export interface HaClient {
  /** Lista actual de estados (snapshot inicial). */
  getAllStates(): Promise<HassEntity[]>;
  /** Llama a un servicio de HA. */
  callService(payload: ServiceCallPayload): Promise<void>;
  /** Suscribe a state_changed; devuelve función para desuscribirse. */
  onStateChanged(listener: StateChangedListener): () => void;
  /** Cierra la conexión y limpia listeners. */
  close(): void;
  /** Estado de conexión actual. */
  isConnected(): boolean;
}

export async function createHaClient(opts: HaClientOptions): Promise<HaClient> {
  const auth = createLongLivedTokenAuth(opts.url, opts.token);
  const connection: Connection = await createConnection({ auth, setupRetry: -1 });

  let connected = true;
  const listeners = new Set<StateChangedListener>();

  connection.addEventListener('ready', () => {
    connected = true;
    opts.onConnected?.();
  });
  connection.addEventListener('disconnected', () => {
    connected = false;
    opts.onDisconnected?.();
  });

  interface HassStateChangedEvent {
    event_type: 'state_changed';
    data: {
      entity_id: string;
      old_state: HassEntity | null;
      new_state: HassEntity | null;
    };
    time_fired: string;
    origin: string;
  }

  const unsubscribeEvents = await connection.subscribeEvents<HassStateChangedEvent>((event) => {
    const data = event.data;
    if (!data?.entity_id) return;
    const payload: StateChangedEvent = {
      entity_id: data.entity_id,
      old_state: data.old_state ?? null,
      new_state: data.new_state ?? null,
    };
    for (const listener of listeners) listener(payload);
  }, 'state_changed');

  return {
    async getAllStates() {
      const states = await getStates(connection);
      return states as HassEntity[];
    },
    async callService(payload) {
      await haCallService(
        connection,
        payload.domain,
        payload.service,
        payload.service_data ?? {},
        payload.target,
      );
    },
    onStateChanged(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      listeners.clear();
      unsubscribeEvents();
      connection.close();
    },
    isConnected() {
      return connected;
    },
  };
}
