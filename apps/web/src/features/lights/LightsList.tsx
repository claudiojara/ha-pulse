import { type HassEntity, isOn } from '@dashboard-web/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { callService } from '@/lib/socket';
import { useEntitiesStore, useLights } from '@/stores/entities';

interface LightsListProps {
  /** Si se pasa, filtra solo las luces de esa área. Sin valor, muestra todas. */
  areaId?: string;
  /** Mensaje cuando no hay luces (override del default). */
  emptyLabel?: string;
}

export function LightsList({ areaId, emptyLabel }: LightsListProps = {}) {
  const lights = useLights(areaId);
  const optimistic = useEntitiesStore((s) => s.optimistic);
  const setOptimistic = useEntitiesStore((s) => s.setOptimistic);
  const clearOptimistic = useEntitiesStore((s) => s.clearOptimistic);

  if (lights.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {emptyLabel ??
            'Sin luces detectadas todavía. Verificá que el backend esté conectado a HA.'}
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
