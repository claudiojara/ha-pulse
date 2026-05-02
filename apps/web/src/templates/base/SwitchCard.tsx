import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useSwitch } from '@/hooks/entities';

interface SwitchCardProps {
  entityId: string;
}

export function SwitchCard({ entityId }: SwitchCardProps) {
  const { entity, isOn, toggle } = useSwitch(entityId);
  if (!entity) return null;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
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
      </CardContent>
    </Card>
  );
}
