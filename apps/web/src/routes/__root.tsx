import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { useHaSocket } from '@/hooks/useHaSocket';
import { useEntitiesStore } from '@/stores/entities';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  useHaSocket();
  const connection = useEntitiesStore((s) => s.connection);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">HA Dashboard</h1>
          <div className="flex items-center gap-2 text-sm">
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
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
