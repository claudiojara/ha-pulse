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

export interface EntityOverride {
  entity_id: EntityId;
  custom_name: string | null;
  custom_icon: string | null;
}

export interface PreferencesSnapshot {
  hidden_entities: EntityId[];
  entity_overrides: Record<EntityId, EntityOverride>;
  room_layouts: Record<string, EntityId[]>;
  user_prefs: Record<string, string>;
}

export interface ChatToolUseEvent {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatToolResultEvent {
  id: string;
  result: unknown;
  is_error: boolean;
}

export interface ChatUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface ChatDoneEvent {
  stop_reason: string | null;
  usage: ChatUsage;
}

export interface ServerToClientEvents {
  initial_states: (states: HassEntity[]) => void;
  initial_areas: (areas: Area[]) => void;
  initial_entity_areas: (map: EntityAreaMap) => void;
  initial_preferences: (prefs: PreferencesSnapshot) => void;
  state_changed: (event: StateChangedEvent) => void;
  areas_updated: (areas: Area[]) => void;
  entity_areas_updated: (map: EntityAreaMap) => void;
  preferences_updated: (prefs: PreferencesSnapshot) => void;
  connection_status: (status: ConnectionStatus) => void;
  chat_text_start: () => void;
  chat_text_delta: (delta: string) => void;
  chat_thinking_start: () => void;
  chat_thinking_delta: (delta: string) => void;
  chat_tool_use_start: (event: { id: string; name: string }) => void;
  chat_tool_use: (event: ChatToolUseEvent) => void;
  chat_tool_result: (event: ChatToolResultEvent) => void;
  chat_done: (event: ChatDoneEvent) => void;
  chat_error: (message: string) => void;
}

export interface SetHiddenPayload {
  entity_id: EntityId;
  hidden: boolean;
}

export interface SetOverridePayload {
  entity_id: EntityId;
  custom_name?: string | null;
  custom_icon?: string | null;
}

export interface SetRoomLayoutPayload {
  area_id: string;
  entity_order: EntityId[];
}

export interface SetPrefPayload {
  key: string;
  value: string;
}

type Ack = (result: { ok: boolean; error?: string }) => void;

export interface ClientToServerEvents {
  call_service: (payload: ServiceCallPayload, ack: Ack) => void;
  set_hidden: (payload: SetHiddenPayload, ack: Ack) => void;
  set_override: (payload: SetOverridePayload, ack: Ack) => void;
  set_room_layout: (payload: SetRoomLayoutPayload, ack: Ack) => void;
  set_pref: (payload: SetPrefPayload, ack: Ack) => void;
  chat_send: (text: string, ack: Ack) => void;
  chat_reset: (ack: Ack) => void;
}

export function getDomain(entityId: EntityId): Domain {
  const dot = entityId.indexOf('.');
  return dot === -1 ? 'unknown' : (entityId.slice(0, dot) as Domain);
}

export function isOn(entity: HassEntity | undefined): boolean {
  if (!entity) return false;
  return entity.state === 'on';
}
