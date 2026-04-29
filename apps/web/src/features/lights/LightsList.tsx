import { Card, CardContent } from '@/components/ui/card';
import { LightCard } from '@/features/lights/LightCard';
import { useLights } from '@/stores/entities';

interface LightsListProps {
  /** Si se pasa, filtra solo las luces de esa área. Sin valor, muestra todas. */
  areaId?: string;
  /** Mensaje cuando no hay luces (override del default). */
  emptyLabel?: string;
}

export function LightsList({ areaId, emptyLabel }: LightsListProps = {}) {
  const lights = useLights(areaId);

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

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lights.map((light) => (
        <LightCard key={light.entity_id} entityId={light.entity_id} />
      ))}
    </div>
  );
}
