import type { ConnectionStatus, EntityId, HassEntity } from '@dashboard-web/shared';
import { create } from 'zustand';

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
  connection: ConnectionStatus;

  setInitialStates: (states: HassEntity[]) => void;
  applyStateChanged: (entityId: EntityId, newState: HassEntity | null) => void;
  setOptimistic: (entityId: EntityId, override: Omit<OptimisticOverride, 'expiresAt'>) => void;
  clearOptimistic: (entityId: EntityId) => void;
  setConnection: (status: ConnectionStatus) => void;
}

const OPTIMISTIC_TTL_MS = 3000;

export const useEntitiesStore = create<EntitiesState>((set) => ({
  entities: {},
  optimistic: {},
  connection: { connected: false, haReachable: false, lastSync: null },

  setInitialStates: (states) =>
    set(() => {
      const map: Record<EntityId, HassEntity> = {};
      for (const s of states) map[s.entity_id] = s;
      return { entities: map };
    }),

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
