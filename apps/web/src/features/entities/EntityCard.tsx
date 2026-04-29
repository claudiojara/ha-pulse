import { getDomain } from '@dashboard-web/shared';
import { Card, CardContent } from '@/components/ui/card';
import { LightCard } from '@/features/lights/LightCard';
import { BinarySensorCard } from '@/features/sensors/BinarySensorCard';
import { SensorCard } from '@/features/sensors/SensorCard';
import { SwitchCard } from '@/features/switches/SwitchCard';
import { useEntity } from '@/stores/entities';

interface EntityCardProps {
  entityId: string;
}

/**
 * Despacha al card específico según el dominio de la entidad.
 * Dominios soportados en Fase 2.a: light, switch.
 * El resto cae a un placeholder hasta 2.b/c/d.
 */
export function EntityCard({ entityId }: EntityCardProps) {
  const entity = useEntity(entityId);
  if (!entity) return null;

  const domain = getDomain(entity.entity_id);
  switch (domain) {
    case 'light':
      return <LightCard entityId={entityId} />;
    case 'switch':
      return <SwitchCard entityId={entityId} />;
    case 'sensor':
      return <SensorCard entityId={entityId} />;
    case 'binary_sensor':
      return <BinarySensorCard entityId={entityId} />;
    default:
      return <UnsupportedCard entityId={entityId} domain={domain} state={entity.state} name={entity.attributes.friendly_name ?? entityId} />;
  }
}

interface UnsupportedCardProps {
  entityId: string;
  domain: string;
  state: string;
  name: string;
}

function UnsupportedCard({ entityId, domain, state, name }: UnsupportedCardProps) {
  return (
    <Card className="opacity-70">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="truncate font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{entityId}</div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono uppercase tracking-wide text-muted-foreground">
            {domain}
          </span>
          <span className="text-muted-foreground">{state}</span>
        </div>
      </CardContent>
    </Card>
  );
}
