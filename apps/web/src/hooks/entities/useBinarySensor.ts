import type { HassEntity } from '@dashboard-web/shared';
import { isOn } from '@dashboard-web/shared';
import { useEntity } from '@/stores/entities';

export interface UseBinarySensorResult {
  entity: HassEntity | undefined;
  isOn: boolean;
  deviceClass: string | undefined;
  isUnavailable: boolean;
}

/** Read-only — sensor binario + device_class. */
export function useBinarySensor(entityId: string): UseBinarySensorResult {
  const entity = useEntity(entityId);
  const isUnavailable = entity
    ? entity.state === 'unavailable' || entity.state === 'unknown'
    : true;
  return {
    entity,
    isOn: isOn(entity),
    deviceClass: entity?.attributes.device_class as string | undefined,
    isUnavailable,
  };
}
