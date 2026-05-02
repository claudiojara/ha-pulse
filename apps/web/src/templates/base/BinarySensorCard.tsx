import { Card, CardContent } from '@/components/ui/card';
import { useBinarySensor } from '@/hooks/entities';
import { binarySensorStateLabel, getDeviceClassIcon } from '@/lib/deviceClassIcon';

interface BinarySensorCardProps {
  entityId: string;
}

/** Card read-only para domain=binary_sensor: ícono + label semántico según device_class y estado. */
export function BinarySensorCard({ entityId }: BinarySensorCardProps) {
  const { entity, isOn, deviceClass, isUnavailable } = useBinarySensor(entityId);
  if (!entity) return null;

  const Icon = getDeviceClassIcon('binary_sensor', deviceClass, isOn);
  const label = isUnavailable ? entity.state : binarySensorStateLabel(deviceClass, isOn);

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${
            isUnavailable
              ? 'bg-muted text-muted-foreground'
              : isOn
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {entity.attributes.friendly_name ?? entity.entity_id}
          </div>
          <div className="truncate text-xs text-muted-foreground">{entity.entity_id}</div>
        </div>
        <span
          className={`shrink-0 text-sm ${
            isUnavailable ? 'text-muted-foreground' : isOn ? 'font-medium' : 'text-muted-foreground'
          }`}
        >
          {label}
        </span>
      </CardContent>
    </Card>
  );
}
