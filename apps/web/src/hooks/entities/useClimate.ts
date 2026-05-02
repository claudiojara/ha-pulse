import type { HassEntity } from '@dashboard-web/shared';
import { useCallback } from 'react';
import { useEntity } from '@/stores/entities';
import { useService } from './useService';

export type HvacMode = 'off' | 'heat' | 'cool' | 'heat_cool' | 'auto' | 'dry' | 'fan_only';

export interface UseClimateResult {
  entity: HassEntity | undefined;
  isUnavailable: boolean;
  currentMode: HvacMode;
  supportedModes: HvacMode[];
  targetTemp: number | undefined;
  currentTemp: number | undefined;
  tempStep: number;
  minTemp: number;
  maxTemp: number;
  unit: string;
  setMode: (mode: HvacMode) => Promise<void>;
  /** Setea el target absoluto (clamped a min/max y redondeado a step). */
  setTargetTemp: (temp: number) => Promise<void>;
  /** Bumpea por `delta` pasos de step (delta=+1 sube un step, delta=-1 baja un step). */
  bumpTemp: (delta: number) => Promise<void>;
}

function numberAttr(entity: HassEntity, key: string): number | undefined {
  const v = entity.attributes[key];
  return typeof v === 'number' ? v : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function useClimate(entityId: string): UseClimateResult {
  const entity = useEntity(entityId);
  const { call } = useService();

  const isUnavailable = entity
    ? entity.state === 'unavailable' || entity.state === 'unknown'
    : true;
  const currentMode = (entity?.state as HvacMode | undefined) ?? 'off';
  const supportedModes = (entity?.attributes.hvac_modes as HvacMode[] | undefined) ?? [];
  const targetTemp = entity ? numberAttr(entity, 'temperature') : undefined;
  const currentTemp = entity ? numberAttr(entity, 'current_temperature') : undefined;
  const tempStep = (entity ? numberAttr(entity, 'target_temp_step') : undefined) ?? 0.5;
  const minTemp = (entity ? numberAttr(entity, 'min_temp') : undefined) ?? 7;
  const maxTemp = (entity ? numberAttr(entity, 'max_temp') : undefined) ?? 35;
  const unit = (entity?.attributes.unit_of_measurement as string | undefined) ?? '°C';

  const setMode = useCallback(
    async (mode: HvacMode) => {
      if (!entity) return;
      await call(
        {
          domain: 'climate',
          service: 'set_hvac_mode',
          target: { entity_id: entity.entity_id },
          service_data: { hvac_mode: mode },
        },
        {
          optimistic: { state: mode },
          label: 'climate.set_hvac_mode',
        },
      );
    },
    [entity, call],
  );

  const setTargetTemp = useCallback(
    async (temp: number) => {
      if (!entity) return;
      const next = clamp(roundToStep(temp, tempStep), minTemp, maxTemp);
      await call(
        {
          domain: 'climate',
          service: 'set_temperature',
          target: { entity_id: entity.entity_id },
          service_data: { temperature: next },
        },
        {
          optimistic: { state: entity.state, attributes: { temperature: next } },
          label: 'climate.set_temperature',
        },
      );
    },
    [entity, tempStep, minTemp, maxTemp, call],
  );

  const bumpTemp = useCallback(
    async (delta: number) => {
      if (!entity || targetTemp === undefined) return;
      const next = clamp(
        roundToStep(targetTemp + delta * tempStep, tempStep),
        minTemp,
        maxTemp,
      );
      if (next === targetTemp) return;
      await call(
        {
          domain: 'climate',
          service: 'set_temperature',
          target: { entity_id: entity.entity_id },
          service_data: { temperature: next },
        },
        {
          optimistic: { state: entity.state, attributes: { temperature: next } },
          label: 'climate.set_temperature',
        },
      );
    },
    [entity, targetTemp, tempStep, minTemp, maxTemp, call],
  );

  return {
    entity,
    isUnavailable,
    currentMode,
    supportedModes,
    targetTemp,
    currentTemp,
    tempStep,
    minTemp,
    maxTemp,
    unit,
    setMode,
    setTargetTemp,
    bumpTemp,
  };
}
