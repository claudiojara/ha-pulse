import type { EntityId, ServiceCallPayload } from '@dashboard-web/shared';
import { useCallback } from 'react';
import { callService } from '@/lib/socket';
import { useEntitiesStore } from '@/stores/entities';

export interface ServiceCallOptions {
  /** Override optimista a aplicar antes de llamar al servicio. */
  optimistic?: {
    state: string;
    attributes?: Record<string, unknown>;
  };
  /** Limpiar el override optimista si la llamada falla. Default: true. */
  clearOnError?: boolean;
  /** Etiqueta para `console.error` si falla. Default: `${domain}.${service}`. */
  label?: string;
}

export interface UseServiceResult {
  call: (
    payload: ServiceCallPayload,
    opts?: ServiceCallOptions,
  ) => Promise<{ ok: boolean; error?: string }>;
  setOptimistic: (
    entityId: EntityId,
    override: { state: string; attributes?: Record<string, unknown> },
  ) => void;
  clearOptimistic: (entityId: EntityId) => void;
}

/**
 * Abstrae el patrón optimistic-update + callService + cleanup-on-error que
 * antes estaba duplicado en 4 cards (Light, Switch, Climate, MediaPlayer).
 *
 * Para casos finos (drag de slider con throttle) se puede acceder a
 * setOptimistic / clearOptimistic directamente.
 */
export function useService(): UseServiceResult {
  const setOptimistic = useEntitiesStore((s) => s.setOptimistic);
  const clearOptimistic = useEntitiesStore((s) => s.clearOptimistic);

  const call = useCallback<UseServiceResult['call']>(
    async (payload, opts) => {
      const target = payload.target?.entity_id;
      const targetId =
        typeof target === 'string'
          ? target
          : Array.isArray(target) && target.length > 0
            ? target[0]
            : undefined;

      if (opts?.optimistic && targetId) {
        setOptimistic(targetId, opts.optimistic);
      }

      const result = await callService(payload);

      if (!result.ok) {
        if (targetId && (opts?.clearOnError ?? true)) {
          clearOptimistic(targetId);
        }
        const label = opts?.label ?? `${payload.domain}.${payload.service}`;
        console.error(`[${label}] falló:`, result.error);
      }

      return result;
    },
    [setOptimistic, clearOptimistic],
  );

  return { call, setOptimistic, clearOptimistic };
}
