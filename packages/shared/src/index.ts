export type EntityId = string;

export type Domain =
  | 'light'
  | 'switch'
  | 'sensor'
  | 'binary_sensor'
  | 'climate'
  | 'media_player'
  | 'camera'
  | 'cover'
  | 'lock'
  | 'fan'
  | 'automation'
  | 'script'
  | 'scene'
  | (string & {});

export interface HassEntityAttributes {
  friendly_name?: string;
  icon?: string;
  unit_of_measurement?: string;
  device_class?: string;
  supported_features?: number;
  brightness?: number;
  rgb_color?: [number, number, number];
  color_temp?: number;
  hs_color?: [number, number];
  [key: string]: unknown;
}

export interface HassEntity {
  entity_id: EntityId;
  state: string;
  attributes: HassEntityAttributes;
  last_changed: string;
  last_updated: string;
  context?: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

export interface StateChangedEvent {
  entity_id: EntityId;
  old_state: HassEntity | null;
  new_state: HassEntity | null;
}

export interface ServiceCallPayload {
  domain: string;
  service: string;
  target?: { entity_id?: EntityId | EntityId[] };
  service_data?: Record<string, unknown>;
}

export interface Area {
  area_id: string;
  name: string;
  icon?: string | null;
}

export interface ConnectionStatus {
  connected: boolean;
  haReachable: boolean;
  lastSync: string | null;
}

/** Mapa entity_id → area_id (o null si la entity no tiene área asignada). */
export type EntityAreaMap = Record<EntityId, string | null>;

export interface ServerToClientEvents {
  initial_states: (states: HassEntity[]) => void;
  initial_areas: (areas: Area[]) => void;
  initial_entity_areas: (map: EntityAreaMap) => void;
  state_changed: (event: StateChangedEvent) => void;
  areas_updated: (areas: Area[]) => void;
  entity_areas_updated: (map: EntityAreaMap) => void;
  connection_status: (status: ConnectionStatus) => void;
}

export interface ClientToServerEvents {
  call_service: (
    payload: ServiceCallPayload,
    ack: (result: { ok: boolean; error?: string }) => void,
  ) => void;
}

export function getDomain(entityId: EntityId): Domain {
  const dot = entityId.indexOf('.');
  return dot === -1 ? 'unknown' : (entityId.slice(0, dot) as Domain);
}

export function isOn(entity: HassEntity | undefined): boolean {
  if (!entity) return false;
  return entity.state === 'on';
}
