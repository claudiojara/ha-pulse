import type Anthropic from '@anthropic-ai/sdk';
import type { HassEntity, ServiceCallPayload } from '@dashboard-web/shared';
import { config } from '../config.js';
import type { HaClient } from '../ha/client.js';

/**
 * Tools que Claude puede invocar para inspeccionar y controlar HA.
 * Definiciones JSON Schema (compatibles con Anthropic SDK) + ejecutores tipados.
 *
 * Las definitions van CACHEADAS junto al system prompt — son estables hasta que
 * cambia el conjunto de tools, lo que rompería el prefix cache (ver
 * shared/prompt-caching.md).
 */

export const tools = [
  {
    name: 'list_areas',
    description:
      'Lista todas las áreas/habitaciones registradas en Home Assistant (cocina, sala, dormitorio, etc.) con su id e ícono. Útil para mapear nombres en lenguaje natural a area_id.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'search_entities',
    description:
      'Busca entidades de HA. Si se pasa `query` filtra por nombre amigable / entity_id (case-insensitive). Si se omite, devuelve todas las entidades que matchean los demás filtros. Para listar TODAS las luces de un área, usá domain="light" + area_id="sala" sin query. Devuelve hasta 30 hits.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Opcional. Texto a buscar en friendly_name o entity_id. Si querés todo lo del filtro, omitir.',
        },
        domain: {
          type: 'string',
          description:
            'Filtrar por dominio HA. Ejemplos: light, switch, sensor, binary_sensor, climate, media_player, camera. Opcional.',
        },
        area_id: {
          type: 'string',
          description: 'Filtrar por área. Ejemplo: "sala", "oficina". Opcional.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_state',
    description:
      'Devuelve el state completo de una entidad: state, atributos (brightness, temperature, supported_features, etc.), last_changed.',
    input_schema: {
      type: 'object',
      properties: {
        entity_id: {
          type: 'string',
          description: 'entity_id completo. Ejemplo: "light.luz_sillon".',
        },
      },
      required: ['entity_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'call_service',
    description:
      'Ejecuta un servicio de HA: turn_on/turn_off de luces y switches, set_temperature de climate, media_play, volume_set, scene.turn_on, etc. Confirmar con el usuario antes de acciones que apaguen/cierren todo a la vez.',
    input_schema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Dominio del servicio. Ejemplos: light, switch, climate, media_player, scene.',
        },
        service: {
          type: 'string',
          description: 'Nombre del servicio. Ejemplos: turn_on, turn_off, set_temperature, volume_set.',
        },
        entity_id: {
          type: ['string', 'array'],
          items: { type: 'string' },
          description: 'entity_id (string) o lista de entity_ids al que aplicar el servicio.',
        },
        service_data: {
          type: 'object',
          description:
            'Parámetros adicionales del servicio. Ejemplos: {brightness_pct: 50}, {temperature: 21}, {volume_level: 0.5}.',
          additionalProperties: true,
        },
      },
      required: ['domain', 'service', 'entity_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_history',
    description:
      'Recupera el historial reciente de cambios de estado de una entidad. Devuelve hasta los últimos `hours_back` (default: 24) cambios. Útil para "¿cuándo se prendió la luz?" o "¿hace cuánto que no hay movimiento?".',
    input_schema: {
      type: 'object',
      properties: {
        entity_id: {
          type: 'string',
          description: 'entity_id de la entidad cuyo historial se quiere ver.',
        },
        hours_back: {
          type: 'number',
          description: 'Cuántas horas hacia atrás traer (1..168). Default 24.',
        },
      },
      required: ['entity_id'],
      additionalProperties: false,
    },
  },
] as const satisfies Anthropic.Tool[];

interface CallServiceArgs {
  domain: string;
  service: string;
  entity_id: string | string[];
  service_data?: Record<string, unknown>;
}

interface SearchArgs {
  query?: string;
  domain?: string;
  area_id?: string;
}

export interface ToolContext {
  ha: HaClient;
  /** entity_id → area_id (lo usa search_entities cuando se filtra por área). */
  entityArea: Record<string, string | null>;
}

export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<{ result: unknown; isError: boolean }> {
  try {
    switch (name) {
      case 'list_areas': {
        const areas = await ctx.ha.getAllAreas();
        return { result: { areas }, isError: false };
      }
      case 'search_entities': {
        const args = input as SearchArgs;
        const states = await ctx.ha.getAllStates();
        return { result: searchEntities(states, ctx.entityArea, args), isError: false };
      }
      case 'get_state': {
        const { entity_id } = input as { entity_id: string };
        const states = await ctx.ha.getAllStates();
        const e = states.find((s) => s.entity_id === entity_id);
        if (!e) return { result: { error: `entity_id no encontrada: ${entity_id}` }, isError: true };
        return { result: pickEntityFields(e), isError: false };
      }
      case 'call_service': {
        const args = input as CallServiceArgs;
        const payload: ServiceCallPayload = {
          domain: args.domain,
          service: args.service,
          target: { entity_id: args.entity_id },
          service_data: args.service_data,
        };
        await ctx.ha.callService(payload);
        return {
          result: { ok: true, called: `${args.domain}.${args.service}`, target: args.entity_id },
          isError: false,
        };
      }
      case 'get_history': {
        const { entity_id, hours_back = 24 } = input as {
          entity_id: string;
          hours_back?: number;
        };
        const hours = Math.max(1, Math.min(168, hours_back));
        return { result: await getHistory(entity_id, hours), isError: false };
      }
      default:
        return { result: { error: `tool desconocido: ${name}` }, isError: true };
    }
  } catch (err) {
    return {
      result: { error: err instanceof Error ? err.message : 'unknown error' },
      isError: true,
    };
  }
}

interface SearchHit {
  entity_id: string;
  friendly_name: string;
  state: string;
  unit?: string;
  area_id?: string | null;
  device_class?: string;
}

function searchEntities(
  states: HassEntity[],
  entityArea: Record<string, string | null>,
  args: SearchArgs,
): { hits: SearchHit[]; total_matches: number; truncated: boolean } {
  const q = args.query?.trim().toLowerCase() ?? '';
  const out: SearchHit[] = [];
  for (const e of states) {
    if (args.domain && !e.entity_id.startsWith(`${args.domain}.`)) continue;
    if (args.area_id && entityArea[e.entity_id] !== args.area_id) continue;
    if (q.length > 0) {
      const name = (e.attributes.friendly_name ?? e.entity_id).toLowerCase();
      if (!name.includes(q) && !e.entity_id.toLowerCase().includes(q)) continue;
    }
    out.push({
      entity_id: e.entity_id,
      friendly_name: (e.attributes.friendly_name as string | undefined) ?? e.entity_id,
      state: e.state,
      unit: e.attributes.unit_of_measurement as string | undefined,
      device_class: e.attributes.device_class as string | undefined,
      area_id: entityArea[e.entity_id] ?? null,
    });
  }
  const total = out.length;
  return { hits: out.slice(0, 30), total_matches: total, truncated: total > 30 };
}

function pickEntityFields(e: HassEntity) {
  // Reducimos los attributes a un subset útil para el LLM, sin volcar todo el blob
  // (algunas entidades traen kilobytes de metadata que no aportan).
  const a = e.attributes;
  return {
    entity_id: e.entity_id,
    state: e.state,
    last_changed: e.last_changed,
    last_updated: e.last_updated,
    attributes: {
      friendly_name: a.friendly_name,
      device_class: a.device_class,
      unit_of_measurement: a.unit_of_measurement,
      brightness: a.brightness,
      color_temp: a.color_temp,
      rgb_color: a.rgb_color,
      hs_color: a.hs_color,
      supported_features: a.supported_features,
      // Climate
      current_temperature: a.current_temperature,
      temperature: a.temperature,
      hvac_modes: a.hvac_modes,
      hvac_action: a.hvac_action,
      preset_mode: a.preset_mode,
      // Media
      media_title: a.media_title,
      media_artist: a.media_artist,
      volume_level: a.volume_level,
      is_volume_muted: a.is_volume_muted,
    },
  };
}

interface HistoryPoint {
  state: string;
  last_changed: string;
}

async function getHistory(entityId: string, hoursBack: number): Promise<HistoryPoint[]> {
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  const url = `${config.ha.url}/api/history/period/${encodeURIComponent(since)}?filter_entity_id=${encodeURIComponent(entityId)}&minimal_response`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.ha.token}` },
  });
  if (!res.ok) {
    throw new Error(`history fetch falló: HTTP ${res.status}`);
  }
  const data = (await res.json()) as Array<Array<{ state: string; last_changed: string }>>;
  if (!Array.isArray(data) || data.length === 0) return [];
  return (data[0] ?? []).map((p) => ({ state: p.state, last_changed: p.last_changed }));
}
