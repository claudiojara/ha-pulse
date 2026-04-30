import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { type Domain, type HassEntity, getDomain } from '@dashboard-web/shared';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EntityCard } from '@/features/entities/EntityCard';
import { EntityCardEdit } from '@/features/entities/EntityCardEdit';
import { setRoomLayoutPref } from '@/lib/socket';
import { useArea } from '@/stores/areas';
import { useEntitiesInArea } from '@/stores/entities';
import {
  useEditMode,
  usePreferencesStore,
  useRoomLayout,
} from '@/stores/preferences';

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
  const allEntities = useEntitiesInArea(areaId);
  const layout = useRoomLayout(areaId);
  const editMode = useEditMode();
  const hidden = usePreferencesStore((s) => s.hidden);

  const visibleEntities = useMemo(() => {
    if (editMode) return allEntities;
    return allEntities.filter((e) => !hidden.has(e.entity_id));
  }, [allEntities, hidden, editMode]);

  const grouped = useMemo(
    () => groupAndOrder(visibleEntities, layout),
    [visibleEntities, layout],
  );

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

  const hiddenInArea = editMode
    ? 0
    : allEntities.filter((e) => hidden.has(e.entity_id)).length;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">{area.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {visibleEntities.length} {visibleEntities.length === 1 ? 'entidad' : 'entidades'} en
          esta habitación.
          {hiddenInArea > 0 && ` (${hiddenInArea} oculta${hiddenInArea === 1 ? '' : 's'})`}
        </p>
      </section>

      {visibleEntities.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {allEntities.length > 0
              ? 'Todas las entidades de esta área están ocultas. Activá el modo edición para mostrarlas.'
              : 'No hay entidades asignadas a esta área.'}
          </CardContent>
        </Card>
      ) : (
        DOMAIN_ORDER.filter((d) => grouped[d]?.length).map((domain) => (
          <DomainSection
            key={domain}
            areaId={areaId}
            domain={domain}
            entities={grouped[domain] ?? []}
            allOrdered={visibleEntities}
          />
        ))
      )}
    </div>
  );
}

interface DomainSectionProps {
  areaId: string;
  domain: Domain;
  entities: HassEntity[];
  allOrdered: HassEntity[];
}

function DomainSection({ areaId, domain, entities, allOrdered }: DomainSectionProps) {
  const editMode = useEditMode();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Reordenar SOLO dentro del grupo de dominio.
    const ids = entities.map((e) => e.entity_id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, String(active.id));

    // Reconstruir el order completo del área manteniendo el resto intacto.
    const fullOrder = allOrdered.map((e) => e.entity_id);
    const setReordered = new Set(reordered);
    let cursor = 0;
    const merged = fullOrder.map((id) => {
      if (setReordered.has(id)) {
        const next = reordered[cursor];
        cursor += 1;
        return next ?? id;
      }
      return id;
    });
    await setRoomLayoutPref({ area_id: areaId, entity_order: merged });
  };

  const grid = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entities.map((e) =>
        editMode ? (
          <EntityCardEdit key={e.entity_id} entityId={e.entity_id} />
        ) : (
          <EntityCard key={e.entity_id} entityId={e.entity_id} />
        ),
      )}
    </div>
  );

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {DOMAIN_LABEL[domain] ?? domain} <span className="ml-1 text-xs">({entities.length})</span>
      </h3>
      {editMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={entities.map((e) => e.entity_id)} strategy={rectSortingStrategy}>
            {grid}
          </SortableContext>
        </DndContext>
      ) : (
        grid
      )}
    </section>
  );
}

function groupAndOrder(
  entities: HassEntity[],
  layout: string[] | undefined,
): Partial<Record<Domain, HassEntity[]>> {
  const grouped: Partial<Record<Domain, HassEntity[]>> = {};
  for (const e of entities) {
    const d = getDomain(e.entity_id);
    if (!grouped[d]) grouped[d] = [];
    grouped[d]?.push(e);
  }
  if (!layout || layout.length === 0) return grouped;
  // Aplicar layout custom: ítems presentes en `layout` van primero según ese orden,
  // los demás caen al final manteniendo el sort por nombre original.
  const order = new Map<string, number>();
  for (let i = 0; i < layout.length; i += 1) order.set(layout[i] ?? '', i);
  for (const list of Object.values(grouped)) {
    if (!list) continue;
    list.sort((a, b) => {
      const ai = order.get(a.entity_id) ?? Number.POSITIVE_INFINITY;
      const bi = order.get(b.entity_id) ?? Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      const an = a.attributes.friendly_name ?? a.entity_id;
      const bn = b.attributes.friendly_name ?? b.entity_id;
      return an.localeCompare(bn);
    });
  }
  return grouped;
}
