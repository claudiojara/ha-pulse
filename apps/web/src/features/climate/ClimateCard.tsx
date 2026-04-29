import type { HassEntity } from '@dashboard-web/shared';
import { Flame, Minus, Plus, Power, Snowflake, Sparkles, Wind } from 'lucide-react';
import { useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { callService } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useEntitiesStore, useEntity } from '@/stores/entities';

interface ClimateCardProps {
  entityId: string;
}

type HvacMode = 'off' | 'heat' | 'cool' | 'heat_cool' | 'auto' | 'dry' | 'fan_only';

const MODE_META: Record<HvacMode, { label: string; icon: typeof Power }> = {
  off: { label: 'Off', icon: Power },
  heat: { label: 'Calor', icon: Flame },
  cool: { label: 'Frío', icon: Snowflake },
  heat_cool: { label: 'Auto', icon: Sparkles },
  auto: { label: 'Auto', icon: Sparkles },
  dry: { label: 'Deshum', icon: Wind },
  fan_only: { label: 'Vent', icon: Wind },
};

export function ClimateCard({ entityId }: ClimateCardProps) {
  const entity = useEntity(entityId);
  const setOptimistic = useEntitiesStore((s) => s.setOptimistic);
  const clearOptimistic = useEntitiesStore((s) => s.clearOptimistic);

  const handleModeChange = useCallback(
    async (mode: HvacMode) => {
      if (!entity) return;
      setOptimistic(entity.entity_id, { state: mode });
      const result = await callService({
        domain: 'climate',
        service: 'set_hvac_mode',
        target: { entity_id: entity.entity_id },
        service_data: { hvac_mode: mode },
      });
      if (!result.ok) {
        clearOptimistic(entity.entity_id);
        console.error('[climate.set_hvac_mode] falló:', result.error);
      }
    },
    [entity, setOptimistic, clearOptimistic],
  );

  const handleTempChange = useCallback(
    async (delta: number) => {
      if (!entity) return;
      const target = numberAttr(entity, 'temperature');
      if (target === undefined) return;
      const step = numberAttr(entity, 'target_temp_step') ?? 0.5;
      const min = numberAttr(entity, 'min_temp') ?? 7;
      const max = numberAttr(entity, 'max_temp') ?? 35;
      const next = clamp(roundToStep(target + delta * step, step), min, max);
      if (next === target) return;
      setOptimistic(entity.entity_id, { state: entity.state, attributes: { temperature: next } });
      const result = await callService({
        domain: 'climate',
        service: 'set_temperature',
        target: { entity_id: entity.entity_id },
        service_data: { temperature: next },
      });
      if (!result.ok) {
        clearOptimistic(entity.entity_id);
        console.error('[climate.set_temperature] falló:', result.error);
      }
    },
    [entity, setOptimistic, clearOptimistic],
  );

  if (!entity) return null;

  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown';
  const currentMode = (entity.state as HvacMode) ?? 'off';
  const supportedModes = (entity.attributes.hvac_modes as HvacMode[] | undefined) ?? [];
  const targetTemp = numberAttr(entity, 'temperature');
  const currentTemp = numberAttr(entity, 'current_temperature');
  const unit = (entity.attributes.unit_of_measurement as string | undefined) ?? '°C';

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium">
              {entity.attributes.friendly_name ?? entity.entity_id}
            </div>
            <div className="truncate text-xs text-muted-foreground">{entity.entity_id}</div>
          </div>
          {currentTemp !== undefined && !isUnavailable && (
            <div className="shrink-0 text-right">
              <div className="font-mono text-2xl tabular-nums leading-none">
                {currentTemp.toFixed(1)}
                <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span>
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                actual
              </div>
            </div>
          )}
        </div>

        {isUnavailable ? (
          <div className="text-sm text-muted-foreground">{entity.state}</div>
        ) : (
          <>
            {targetTemp !== undefined && currentMode !== 'off' && (
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Target
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleTempChange(-1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-muted"
                    aria-label="Bajar temperatura"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[3.5rem] text-center font-mono tabular-nums">
                    {targetTemp.toFixed(1)}
                    <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleTempChange(1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-muted"
                    aria-label="Subir temperatura"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {supportedModes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {supportedModes.map((mode) => {
                  const meta = MODE_META[mode] ?? { label: mode, icon: Power };
                  const Icon = meta.icon;
                  const active = mode === currentMode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => void handleModeChange(mode)}
                      className={cn(
                        'flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-muted',
                      )}
                      aria-pressed={active}
                    >
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
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
