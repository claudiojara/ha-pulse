import { isOn } from '@dashboard-web/shared';
import { useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { callService } from '@/lib/socket';
import { useEntitiesStore, useEntity } from '@/stores/entities';

interface SwitchCardProps {
  entityId: string;
}

export function SwitchCard({ entityId }: SwitchCardProps) {
  const entity = useEntity(entityId);
  const setOptimistic = useEntitiesStore((s) => s.setOptimistic);
  const clearOptimistic = useEntitiesStore((s) => s.clearOptimistic);

  const handleToggle = useCallback(
    async (nextOn: boolean): Promise<void> => {
      if (!entity) return;
      setOptimistic(entity.entity_id, { state: nextOn ? 'on' : 'off' });
      const result = await callService({
        domain: 'switch',
        service: nextOn ? 'turn_on' : 'turn_off',
        target: { entity_id: entity.entity_id },
      });
      if (!result.ok) {
        clearOptimistic(entity.entity_id);
        console.error('[switch.toggle] falló:', result.error);
      }
    },
    [entity, setOptimistic, clearOptimistic],
  );

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
          checked={isOn(entity)}
          onCheckedChange={handleToggle}
          aria-label={`Toggle ${entity.attributes.friendly_name ?? entity.entity_id}`}
        />
      </CardContent>
    </Card>
  );
}
