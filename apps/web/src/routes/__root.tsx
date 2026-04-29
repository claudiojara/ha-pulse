import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { Sidebar } from '@/components/Sidebar';
import { useHaSocket } from '@/hooks/useHaSocket';
import { useEntitiesStore, useLightsOnCount } from '@/stores/entities';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  useHaSocket();
  const connection = useEntitiesStore((s) => s.connection);
  const lightsOn = useLightsOnCount();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">HA Dashboard</h1>
          <div className="flex items-center gap-4 text-sm">
            <div
              className="text-muted-foreground"
              data-testid="lights-on-count"
              aria-label={`${lightsOn} luces encendidas`}
            >
              <span className="font-medium text-foreground">{lightsOn}</span>{' '}
              {lightsOn === 1 ? 'luz encendida' : 'luces encendidas'}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  connection.connected && connection.haReachable
                    ? 'bg-green-500'
                    : connection.connected
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                aria-hidden
              />
              <span className="text-muted-foreground">
                {connection.connected
                  ? connection.haReachable
                    ? 'conectado'
                    : 'API ok, HA caído'
                  : 'desconectado'}
              </span>
            </div>
          </div>
        </div>
      </header>
      <div className="flex">
        <Sidebar />
        <main className="flex-1 px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
