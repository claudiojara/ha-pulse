import {
  type ConnectionStatus,
  type EntityAreaMap,
  type EntityId,
  type HassEntity,
  getDomain,
  isOn,
} from '@dashboard-web/shared';
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

interface OptimisticOverride {
  state: string;
  attributes?: Partial<HassEntity['attributes']>;
  expiresAt: number;
}

interface EntitiesState {
  /** Estado autoritativo desde HA. */
  entities: Record<EntityId, HassEntity>;
  /** Estado optimista por entidad. Se aplica encima del autoritativo hasta que reconcilia. */
  optimistic: Record<EntityId, OptimisticOverride>;
  /** entity_id → area_id (resuelto en backend). */
  entityArea: EntityAreaMap;
  connection: ConnectionStatus;

  setInitialStates: (states: HassEntity[]) => void;
  applyStateChanged: (entityId: EntityId, newState: HassEntity | null) => void;
  setEntityAreaMap: (map: EntityAreaMap) => void;
  setOptimistic: (entityId: EntityId, override: Omit<OptimisticOverride, 'expiresAt'>) => void;
  clearOptimistic: (entityId: EntityId) => void;
  setConnection: (status: ConnectionStatus) => void;
}

const OPTIMISTIC_TTL_MS = 3000;

export const useEntitiesStore = create<EntitiesState>((set) => ({
  entities: {},
  optimistic: {},
  entityArea: {},
  connection: { connected: false, haReachable: false, lastSync: null },

  setInitialStates: (states) =>
    set(() => {
      const map: Record<EntityId, HassEntity> = {};
      for (const s of states) map[s.entity_id] = s;
      return { entities: map };
    }),

  setEntityAreaMap: (map) => set(() => ({ entityArea: map })),

  applyStateChanged: (entityId, newState) =>
    set((prev) => {
      const entities = { ...prev.entities };
      if (newState) {
        entities[entityId] = newState;
      } else {
        delete entities[entityId];
      }
      // Reconciliar optimistic: si HA confirmó (state real coincide con override), limpiar.
      const optimistic = { ...prev.optimistic };
      const override = optimistic[entityId];
      if (override && newState && newState.state === override.state) {
        delete optimistic[entityId];
      }
      return { entities, optimistic };
    }),

  setOptimistic: (entityId, override) =>
    set((prev) => ({
      optimistic: {
        ...prev.optimistic,
        [entityId]: { ...override, expiresAt: Date.now() + OPTIMISTIC_TTL_MS },
      },
    })),

  clearOptimistic: (entityId) =>
    set((prev) => {
      const next = { ...prev.optimistic };
      delete next[entityId];
      return { optimistic: next };
    }),

  setConnection: (status) => set(() => ({ connection: status })),
}));

/**
 * Selector que devuelve la entidad con override optimista aplicado.
 * Usar este selector en componentes para "ver" cambios optimistas instantáneos.
 */
export function useEntity(entityId: EntityId | undefined): HassEntity | undefined {
  return useEntitiesStore((s) => {
    if (!entityId) return undefined;
    const real = s.entities[entityId];
    const override = s.optimistic[entityId];
    if (!real) return undefined;
    if (!override) return real;
    return {
      ...real,
      state: override.state,
      attributes: { ...real.attributes, ...(override.attributes ?? {}) },
    };
  });
}

/** Lista de entity_ids que pertenecen al área dada (vía entity_registry/device_registry). */
export function useEntityIdsInArea(areaId: string | undefined): EntityId[] {
  return useEntitiesStore(
    useShallow((s) => {
      if (!areaId) return [];
      const ids: EntityId[] = [];
      for (const [entityId, entityArea] of Object.entries(s.entityArea)) {
        if (entityArea === areaId) ids.push(entityId);
      }
      return ids.sort();
    }),
  );
}

/**
 * Selector de luces sorteadas por nombre. Si se pasa areaId, filtra a las que pertenecen al área.
 * Sin areaId, devuelve todas las luces.
 */
export function useLights(areaId?: string): HassEntity[] {
  return useEntitiesStore(
    useShallow((s) => {
      const list: HassEntity[] = [];
      for (const e of Object.values(s.entities)) {
        if (getDomain(e.entity_id) !== 'light') continue;
        if (areaId && s.entityArea[e.entity_id] !== areaId) continue;
        list.push(e);
      }
      list.sort((a, b) => {
        const an = a.attributes.friendly_name ?? a.entity_id;
        const bn = b.attributes.friendly_name ?? b.entity_id;
        return an.localeCompare(bn);
      });
      return list;
    }),
  );
}

/** Cantidad de luces ENCENDIDAS, considerando override optimista. Reactivo cross-route. */
export function useLightsOnCount(): number {
  return useEntitiesStore((s) => {
    let count = 0;
    for (const e of Object.values(s.entities)) {
      if (getDomain(e.entity_id) !== 'light') continue;
      const override = s.optimistic[e.entity_id];
      const on = override ? override.state === 'on' : isOn(e);
      if (on) count += 1;
    }
    return count;
  });
}
