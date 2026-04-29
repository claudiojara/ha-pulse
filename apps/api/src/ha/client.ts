import WebSocket from 'ws';
import {
  type Connection,
  callService as haCallService,
  createConnection,
  createLongLivedTokenAuth,
  getStates,
} from 'home-assistant-js-websocket';
import type {
  Area,
  EntityAreaMap,
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
export type AreasUpdatedListener = (areas: Area[]) => void;
export type EntityAreasListener = (map: EntityAreaMap) => void;

interface HaAreaRegistryEntry {
  area_id: string;
  name: string;
  icon?: string | null;
  picture?: string | null;
  floor_id?: string | null;
  aliases?: string[];
  labels?: string[];
}

interface HaEntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  area_id: string | null;
  // ... más campos que no usamos
}

interface HaDeviceRegistryEntry {
  id: string;
  area_id: string | null;
  // ... más campos que no usamos
}

export interface HaClient {
  /** Lista actual de estados (snapshot inicial). */
  getAllStates(): Promise<HassEntity[]>;
  /** Lista actual de áreas registradas en HA. */
  getAllAreas(): Promise<Area[]>;
  /** Mapa entity_id → area_id (resuelto via entity_registry + device_registry). */
  getEntityAreaMap(): Promise<EntityAreaMap>;
  /** Llama a un servicio de HA. */
  callService(payload: ServiceCallPayload): Promise<void>;
  /** Suscribe a state_changed; devuelve función para desuscribirse. */
  onStateChanged(listener: StateChangedListener): () => void;
  /** Suscribe a cambios en area_registry; el listener recibe la lista actualizada completa. */
  onAreasUpdated(listener: AreasUpdatedListener): () => void;
  /** Suscribe a cambios en el mapa entity→area (cualquier cambio en entity/device/area registry). */
  onEntityAreasUpdated(listener: EntityAreasListener): () => void;
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
  const areasListeners = new Set<AreasUpdatedListener>();
  const entityAreasListeners = new Set<EntityAreasListener>();

  const fetchAreas = async (): Promise<Area[]> => {
    const raw = await connection.sendMessagePromise<HaAreaRegistryEntry[]>({
      type: 'config/area_registry/list',
    });
    return raw.map((a) => ({
      area_id: a.area_id,
      name: a.name,
      icon: a.icon ?? null,
    }));
  };

  const fetchEntityAreaMap = async (): Promise<EntityAreaMap> => {
    const [entities, devices] = await Promise.all([
      connection.sendMessagePromise<HaEntityRegistryEntry[]>({
        type: 'config/entity_registry/list',
      }),
      connection.sendMessagePromise<HaDeviceRegistryEntry[]>({
        type: 'config/device_registry/list',
      }),
    ]);
    const deviceArea: Record<string, string | null> = {};
    for (const d of devices) deviceArea[d.id] = d.area_id ?? null;

    const map: EntityAreaMap = {};
    for (const e of entities) {
      // entity_registry.area_id tiene prioridad (override explícito).
      // Sino, hereda del device.
      const areaId = e.area_id ?? (e.device_id ? (deviceArea[e.device_id] ?? null) : null);
      map[e.entity_id] = areaId;
    }
    return map;
  };

  const broadcastEntityAreas = async (): Promise<void> => {
    if (entityAreasListeners.size === 0) return;
    try {
      const map = await fetchEntityAreaMap();
      for (const listener of entityAreasListeners) listener(map);
    } catch {
      // race con disconnect; el reconnect siguiente reenviará el snapshot inicial
    }
  };

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

  // HA emite area_registry_updated SIN payload de la lista — re-fetcheamos completo.
  const unsubscribeAreas = await connection.subscribeEvents(async () => {
    if (areasListeners.size === 0) return;
    try {
      const areas = await fetchAreas();
      for (const listener of areasListeners) listener(areas);
    } catch {
      // si falla el refetch (race con disconnect), el reconnect siguiente reenviará initial_areas
    }
  }, 'area_registry_updated');

  // Cualquier cambio en area/entity/device registry puede afectar el mapa entity→area.
  // Recomputamos el mapa entero (idempotente, fácil de razonar) en vez de mantener caches.
  const unsubscribeEntityArea = await Promise.all([
    connection.subscribeEvents(broadcastEntityAreas, 'area_registry_updated'),
    connection.subscribeEvents(broadcastEntityAreas, 'entity_registry_updated'),
    connection.subscribeEvents(broadcastEntityAreas, 'device_registry_updated'),
  ]);

  return {
    async getAllStates() {
      const states = await getStates(connection);
      return states as HassEntity[];
    },
    getAllAreas: fetchAreas,
    getEntityAreaMap: fetchEntityAreaMap,
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
    onAreasUpdated(listener) {
      areasListeners.add(listener);
      return () => {
        areasListeners.delete(listener);
      };
    },
    onEntityAreasUpdated(listener) {
      entityAreasListeners.add(listener);
      return () => {
        entityAreasListeners.delete(listener);
      };
    },
    close() {
      listeners.clear();
      areasListeners.clear();
      entityAreasListeners.clear();
      unsubscribeEvents();
      unsubscribeAreas();
      for (const u of unsubscribeEntityArea) u();
      connection.close();
    },
    isConnected() {
      return connected;
    },
  };
}
