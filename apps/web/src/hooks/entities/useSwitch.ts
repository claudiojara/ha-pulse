import type { HassEntity } from '@dashboard-web/shared';
import { isOn } from '@dashboard-web/shared';
import { useCallback } from 'react';
import { useEntity } from '@/stores/entities';
import { useService } from './useService';

export interface UseSwitchResult {
  entity: HassEntity | undefined;
  isOn: boolean;
  toggle: (nextOn: boolean) => Promise<void>;
}

export function useSwitch(entityId: string): UseSwitchResult {
  const entity = useEntity(entityId);
  const { call } = useService();

  const toggle = useCallback(
    async (nextOn: boolean) => {
      if (!entity) return;
      await call(
        {
          domain: 'switch',
          service: nextOn ? 'turn_on' : 'turn_off',
          target: { entity_id: entity.entity_id },
        },
        {
          optimistic: { state: nextOn ? 'on' : 'off' },
          label: 'switch.toggle',
        },
      );
    },
    [entity, call],
  );

  return { entity, isOn: isOn(entity), toggle };
}
