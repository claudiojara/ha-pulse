import { Card, CardContent } from '@/components/ui/card';
import { useSensor } from '@/hooks/entities';
import { getDeviceClassIcon } from '@/lib/deviceClassIcon';

interface SensorCardProps {
  entityId: string;
}

/** Card read-only para domain=sensor: muestra valor + unidad + ícono según device_class. */
export function SensorCard({ entityId }: SensorCardProps) {
  const { entity, value, unit, deviceClass, isUnavailable } = useSensor(entityId);
  if (!entity) return null;

  const Icon = getDeviceClassIcon('sensor', deviceClass);

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {entity.attributes.friendly_name ?? entity.entity_id}
          </div>
          <div className="truncate text-xs text-muted-foreground">{entity.entity_id}</div>
        </div>
        <div className="shrink-0 text-right">
          {isUnavailable ? (
            <span className="text-sm text-muted-foreground">{value}</span>
          ) : (
            <span className="font-mono text-sm tabular-nums">
              {value}
              {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
