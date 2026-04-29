import { type HassEntity, isOn } from '@dashboard-web/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { callService } from '@/lib/socket';
import { useEntitiesStore, useEntity } from '@/stores/entities';

interface LightCardProps {
  entityId: string;
}

const BRIGHTNESS_THROTTLE_MS = 150;

/** HA usa brightness 1..255. Lo exponemos al usuario como 1..100%. */
function haToPct(brightness: number | undefined): number {
  if (!brightness || brightness < 1) return 0;
  return Math.max(1, Math.round((brightness / 255) * 100));
}
function pctToHa(pct: number): number {
  return Math.max(1, Math.min(255, Math.round((pct / 100) * 255)));
}

export function LightCard({ entityId }: LightCardProps) {
  const entity = useEntity(entityId);
  const setOptimistic = useEntitiesStore((s) => s.setOptimistic);
  const clearOptimistic = useEntitiesStore((s) => s.clearOptimistic);

  const [draggingPct, setDraggingPct] = useState<number | null>(null);
  const lastSentRef = useRef<number>(0);

  const handleToggle = useCallback(
    async (nextOn: boolean): Promise<void> => {
      if (!entity) return;
      setOptimistic(entity.entity_id, { state: nextOn ? 'on' : 'off' });
      const result = await callService({
        domain: 'light',
        service: nextOn ? 'turn_on' : 'turn_off',
        target: { entity_id: entity.entity_id },
      });
      if (!result.ok) {
        clearOptimistic(entity.entity_id);
        console.error('[light.toggle] falló:', result.error);
      }
    },
    [entity, setOptimistic, clearOptimistic],
  );

  const handleBrightnessChange = useCallback(
    (values: number[]): void => {
      if (!entity || values.length === 0) return;
      const pct = values[0] ?? 0;
      setDraggingPct(pct);

      // Throttle de service calls mientras se arrastra; el último siempre se manda en commit.
      const now = Date.now();
      if (now - lastSentRef.current < BRIGHTNESS_THROTTLE_MS) return;
      lastSentRef.current = now;

      setOptimistic(entity.entity_id, {
        state: 'on',
        attributes: { brightness: pctToHa(pct) },
      });
      void callService({
        domain: 'light',
        service: 'turn_on',
        target: { entity_id: entity.entity_id },
        service_data: { brightness: pctToHa(pct) },
      });
    },
    [entity, setOptimistic],
  );

  const handleBrightnessCommit = useCallback(
    async (values: number[]): Promise<void> => {
      if (!entity || values.length === 0) return;
      const pct = values[0] ?? 0;
      setDraggingPct(null);
      setOptimistic(entity.entity_id, {
        state: 'on',
        attributes: { brightness: pctToHa(pct) },
      });
      const result = await callService({
        domain: 'light',
        service: 'turn_on',
        target: { entity_id: entity.entity_id },
        service_data: { brightness: pctToHa(pct) },
      });
      if (!result.ok) {
        clearOptimistic(entity.entity_id);
        console.error('[light.brightness] falló:', result.error);
      }
    },
    [entity, setOptimistic, clearOptimistic],
  );

  // Reset dragging si el state cambia desde fuera (HA confirma o cambia desde otra app).
  const realBrightnessPct = haToPct(entity?.attributes.brightness as number | undefined);
  useEffect(() => {
    setDraggingPct(null);
  }, [realBrightnessPct]);

  if (!entity) return null;

  const on = isOn(entity);
  const supportsBrightness =
    typeof entity.attributes.brightness === 'number' || entity.attributes.brightness === null;
  const displayPct = draggingPct ?? realBrightnessPct;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate font-medium">
              {entity.attributes.friendly_name ?? entity.entity_id}
            </div>
            <div className="truncate text-xs text-muted-foreground">{entity.entity_id}</div>
          </div>
          <Switch
            checked={on}
            onCheckedChange={handleToggle}
            aria-label={`Toggle ${entity.attributes.friendly_name ?? entity.entity_id}`}
          />
        </div>
        {on && supportsBrightness && (
          <div className="flex items-center gap-3">
            <Slider
              value={[displayPct]}
              min={1}
              max={100}
              step={1}
              onValueChange={handleBrightnessChange}
              onValueCommit={handleBrightnessCommit}
              aria-label="Brillo"
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {displayPct}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
