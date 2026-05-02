import type { HassEntity } from '@dashboard-web/shared';
import { useEntity } from '@/stores/entities';

export interface UseSensorResult {
  entity: HassEntity | undefined;
  /** Valor en bruto (raw `state`). No castea a número porque sensores pueden ser strings. */
  value: string;
  unit: string | undefined;
  deviceClass: string | undefined;
  isUnavailable: boolean;
}

/** Read-only — solo lectura del sensor + atributos comunes. */
export function useSensor(entityId: string): UseSensorResult {
  const entity = useEntity(entityId);
  const isUnavailable = entity
    ? entity.state === 'unavailable' || entity.state === 'unknown'
    : true;
  return {
    entity,
    value: entity?.state ?? '',
    unit: entity?.attributes.unit_of_measurement as string | undefined,
    deviceClass: entity?.attributes.device_class as string | undefined,
    isUnavailable,
  };
}
