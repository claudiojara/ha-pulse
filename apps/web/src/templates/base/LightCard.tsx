import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useLight } from '@/hooks/entities';
import { useThrottle } from '@/hooks/useThrottle';

interface LightCardProps {
  entityId: string;
}

const BRIGHTNESS_THROTTLE_MS = 150;

export function LightCard({ entityId }: LightCardProps) {
  const { entity, isOn, brightnessPct, supportsBrightness, toggle, setBrightnessPct } =
    useLight(entityId);

  // State UI-only: valor del slider mientras se arrastra. Se resetea al confirmarse el cambio
  // real por HA (cuando brightnessPct actualiza desde fuera).
  const [draggingPct, setDraggingPct] = useState<number | null>(null);
  useEffect(() => {
    setDraggingPct(null);
  }, [brightnessPct]);

  const setBrightnessThrottled = useThrottle(setBrightnessPct, BRIGHTNESS_THROTTLE_MS);

  if (!entity) return null;

  const displayPct = draggingPct ?? brightnessPct;

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
            checked={isOn}
            onCheckedChange={toggle}
            aria-label={`Toggle ${entity.attributes.friendly_name ?? entity.entity_id}`}
          />
        </div>
        {isOn && supportsBrightness && (
          <div className="flex items-center gap-3">
            <Slider
              value={[displayPct]}
              min={1}
              max={100}
              step={1}
              onValueChange={(values) => {
                const pct = values[0] ?? 0;
                setDraggingPct(pct);
                setBrightnessThrottled(pct);
              }}
              onValueCommit={(values) => {
                const pct = values[0] ?? 0;
                setDraggingPct(null);
                void setBrightnessPct(pct);
              }}
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
