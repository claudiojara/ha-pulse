import { createFileRoute } from '@tanstack/react-router';
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
          Filtro de entidades por área llega en Fase 1.b. Por ahora, sidebar y routing.
        </p>
      </section>
    </div>
  );
}
