import { createFileRoute } from '@tanstack/react-router';
import { LightsList } from '@/features/lights/LightsList';
import { useArea } from '@/stores/areas';

export const Route = createFileRoute('/room/$areaId')({
  component: RoomPage,
});

function RoomPage() {
  const { areaId } = Route.useParams();
  const area = useArea(areaId);

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
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">{area.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Luces de esta habitación. Otras entidades (climate, media, sensores) llegan en Fase 2.
        </p>
      </section>
      <LightsList areaId={area.area_id} emptyLabel="No hay luces asignadas a esta área." />
    </div>
  );
}
