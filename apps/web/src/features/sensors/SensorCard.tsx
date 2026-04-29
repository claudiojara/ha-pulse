import { Card, CardContent } from '@/components/ui/card';
import { getDeviceClassIcon } from '@/lib/deviceClassIcon';
import { useEntity } from '@/stores/entities';

interface SensorCardProps {
  entityId: string;
}

/** Card read-only para domain=sensor: muestra valor + unidad + ícono según device_class. */
export function SensorCard({ entityId }: SensorCardProps) {
  const entity = useEntity(entityId);
  if (!entity) return null;

  const deviceClass = entity.attributes.device_class as string | undefined;
  const Icon = getDeviceClassIcon('sensor', deviceClass);
  const unit = entity.attributes.unit_of_measurement as string | undefined;
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown';

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
            <span className="text-sm text-muted-foreground">{entity.state}</span>
          ) : (
            <span className="font-mono text-sm tabular-nums">
              {entity.state}
              {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
