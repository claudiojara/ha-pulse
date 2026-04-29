import { type HassEntity, getDomain, isOn } from '@dashboard-web/shared';
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { callService } from '@/lib/socket';
import { useEntitiesStore } from '@/stores/entities';

export function LightsList() {
  const entities = useEntitiesStore((s) => s.entities);
  const optimistic = useEntitiesStore((s) => s.optimistic);
  const setOptimistic = useEntitiesStore((s) => s.setOptimistic);
  const clearOptimistic = useEntitiesStore((s) => s.clearOptimistic);

  const lights = useMemo(() => {
    const list = Object.values(entities).filter((e) => getDomain(e.entity_id) === 'light');
    return list.sort((a, b) => {
      const an = a.attributes.friendly_name ?? a.entity_id;
      const bn = b.attributes.friendly_name ?? b.entity_id;
      return an.localeCompare(bn);
    });
  }, [entities]);

  if (lights.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Sin luces detectadas todavía. Verificá que el backend esté conectado a HA.
        </CardContent>
      </Card>
    );
  }

  const handleToggle = async (entity: HassEntity, nextOn: boolean): Promise<void> => {
    setOptimistic(entity.entity_id, { state: nextOn ? 'on' : 'off' });
    const result = await callService({
      domain: 'light',
      service: nextOn ? 'turn_on' : 'turn_off',
      target: { entity_id: entity.entity_id },
    });
    if (!result.ok) {
      // Revertir si HA rechazó la llamada.
      clearOptimistic(entity.entity_id);
      console.error('[callService] falló:', result.error);
    }
    // Si ok, esperamos al state_changed real para reconciliar (lo hace el store).
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lights.map((light) => (
        <LightCard
          key={light.entity_id}
          entity={light}
          optimisticOn={
            optimistic[light.entity_id] ? optimistic[light.entity_id]?.state === 'on' : null
          }
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

interface LightCardProps {
  entity: HassEntity;
  optimisticOn: boolean | null;
  onToggle: (entity: HassEntity, nextOn: boolean) => void;
}

function LightCard({ entity, optimisticOn, onToggle }: LightCardProps) {
  const realOn = isOn(entity);
  const on = optimisticOn ?? realOn;
  const isOptimistic = optimisticOn !== null;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="truncate font-medium">
            {entity.attributes.friendly_name ?? entity.entity_id}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {entity.entity_id}
            {isOptimistic && <span className="ml-2 text-amber-500">(optimistic)</span>}
          </div>
        </div>
        <Switch checked={on} onCheckedChange={(next) => onToggle(entity, next)} />
      </CardContent>
    </Card>
  );
}
