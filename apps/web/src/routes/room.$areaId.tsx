import { type Domain, type HassEntity, getDomain } from '@dashboard-web/shared';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EntityCard } from '@/features/entities/EntityCard';
import { useArea } from '@/stores/areas';
import { useEntitiesInArea } from '@/stores/entities';

export const Route = createFileRoute('/room/$areaId')({
  component: RoomPage,
});

const DOMAIN_LABEL: Partial<Record<Domain, string>> = {
  light: 'Luces',
  switch: 'Interruptores',
  sensor: 'Sensores',
  binary_sensor: 'Sensores binarios',
  climate: 'Clima',
  media_player: 'Media',
  camera: 'Cámaras',
  cover: 'Persianas',
  lock: 'Cerraduras',
  fan: 'Ventiladores',
  scene: 'Escenas',
  script: 'Scripts',
  automation: 'Automatizaciones',
};

const DOMAIN_ORDER: Domain[] = [
  'light',
  'switch',
  'climate',
  'media_player',
  'camera',
  'cover',
  'fan',
  'lock',
  'scene',
  'script',
  'automation',
  'binary_sensor',
  'sensor',
];

function RoomPage() {
  const { areaId } = Route.useParams();
  const area = useArea(areaId);
  const entities = useEntitiesInArea(areaId);

  const grouped = useMemo(() => groupByDomain(entities), [entities]);

  if (!area) {
    return (
      <div className="space-y-6">
        <section>
          <h2 className="text-2xl font-semibold tracking-tight">Habitación</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Buscando área <code className="rounded bg-muted px-1">{areaId}</code>…
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">{area.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {entities.length} {entities.length === 1 ? 'entidad' : 'entidades'} en esta habitación.
        </p>
      </section>

      {entities.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No hay entidades asignadas a esta área.
          </CardContent>
        </Card>
      ) : (
        DOMAIN_ORDER.filter((d) => grouped[d]?.length).map((domain) => (
          <DomainSection key={domain} domain={domain} entities={grouped[domain] ?? []} />
        ))
      )}
    </div>
  );
}

function DomainSection({ domain, entities }: { domain: Domain; entities: HassEntity[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {DOMAIN_LABEL[domain] ?? domain} <span className="ml-1 text-xs">({entities.length})</span>
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entities.map((e) => (
          <EntityCard key={e.entity_id} entityId={e.entity_id} />
        ))}
      </div>
    </section>
  );
}

function groupByDomain(entities: HassEntity[]): Partial<Record<Domain, HassEntity[]>> {
  const grouped: Partial<Record<Domain, HassEntity[]>> = {};
  for (const e of entities) {
    const d = getDomain(e.entity_id);
    if (!grouped[d]) grouped[d] = [];
    grouped[d]?.push(e);
  }
  return grouped;
}
