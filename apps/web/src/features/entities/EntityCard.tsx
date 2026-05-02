import { getDomain } from '@dashboard-web/shared';
import { Card, CardContent } from '@/components/ui/card';
import { useEntity } from '@/stores/entities';
import { useActiveTemplate } from '@/templates/registry';

interface EntityCardProps {
  entityId: string;
}

/**
 * Resuelve el componente de card según el template activo + dominio de la
 * entidad. Si el template no implementa el dominio, cae a `UnsupportedCard`.
 *
 * El template activo viene de `user_prefs.active_template_id`. Default `base`.
 */
export function EntityCard({ entityId }: EntityCardProps) {
  const entity = useEntity(entityId);
  const template = useActiveTemplate();
  if (!entity) return null;

  const domain = getDomain(entity.entity_id);
  const Component = template.cards[domain];
  if (!Component) {
    return (
      <UnsupportedCard
        entityId={entityId}
        domain={domain}
        state={entity.state}
        name={entity.attributes.friendly_name ?? entityId}
      />
    );
  }
  return <Component entityId={entityId} />;
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
