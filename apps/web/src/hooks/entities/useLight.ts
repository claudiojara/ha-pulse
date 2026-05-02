import type { HassEntity } from '@dashboard-web/shared';
import { isOn } from '@dashboard-web/shared';
import { useCallback } from 'react';
import { useEntity } from '@/stores/entities';
import { useService } from './useService';

export interface UseLightResult {
  entity: HassEntity | undefined;
  isOn: boolean;
  /** Brillo expuesto como 0..100. `null` si la entidad no soporta brillo o está apagada. */
  brightnessPct: number;
  supportsBrightness: boolean;
  /** Toggle on/off. `nextOn` permite forzar destino. */
  toggle: (nextOn: boolean) => Promise<void>;
  /** Setear brillo en porcentaje (1..100). Convierte internamente a 1..255 de HA. */
  setBrightnessPct: (pct: number) => Promise<void>;
}

/** HA usa brightness 1..255. Lo exponemos al usuario como 1..100%. */
function haToPct(brightness: number | undefined): number {
  if (!brightness || brightness < 1) return 0;
  return Math.max(1, Math.round((brightness / 255) * 100));
}

function pctToHa(pct: number): number {
  return Math.max(1, Math.min(255, Math.round((pct / 100) * 255)));
}

export function useLight(entityId: string): UseLightResult {
  const entity = useEntity(entityId);
  const { call } = useService();

  const supportsBrightness = entity
    ? typeof entity.attributes.brightness === 'number' || entity.attributes.brightness === null
    : false;
  const brightnessPct = haToPct(entity?.attributes.brightness as number | undefined);
  const on = isOn(entity);

  const toggle = useCallback(
    async (nextOn: boolean) => {
      if (!entity) return;
      await call(
        {
          domain: 'light',
          service: nextOn ? 'turn_on' : 'turn_off',
          target: { entity_id: entity.entity_id },
        },
        {
          optimistic: { state: nextOn ? 'on' : 'off' },
          label: 'light.toggle',
        },
      );
    },
    [entity, call],
  );

  const setBrightnessPct = useCallback(
    async (pct: number) => {
      if (!entity) return;
      const haBrightness = pctToHa(pct);
      await call(
        {
          domain: 'light',
          service: 'turn_on',
          target: { entity_id: entity.entity_id },
          service_data: { brightness: haBrightness },
        },
        {
          optimistic: { state: 'on', attributes: { brightness: haBrightness } },
          label: 'light.brightness',
        },
      );
    },
    [entity, call],
  );

  return {
    entity,
    isOn: on,
    brightnessPct,
    supportsBrightness,
    toggle,
    setBrightnessPct,
  };
}
