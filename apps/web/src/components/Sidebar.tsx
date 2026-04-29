import { Link } from '@tanstack/react-router';
import { useAreasList } from '@/stores/areas';

export function Sidebar() {
  const areas = useAreasList();

  return (
    <aside className="w-56 shrink-0 border-r bg-background/60">
      <nav className="sticky top-[60px] flex flex-col gap-1 p-3">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground data-[active=true]:font-medium"
          activeProps={{ 'data-active': 'true' }}
        >
          Overview
        </Link>
        {areas.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Cargando áreas…</p>
        ) : (
          <>
            <div className="mt-3 px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Habitaciones
            </div>
            {areas.map((area) => (
              <Link
                key={area.area_id}
                to="/room/$areaId"
                params={{ areaId: area.area_id }}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground data-[active=true]:font-medium"
                activeProps={{ 'data-active': 'true' }}
              >
                {area.name}
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
