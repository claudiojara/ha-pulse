import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { Moon, Pencil, Sun } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useHaSocket } from '@/hooks/useHaSocket';
import { useTheme, useThemeSync } from '@/hooks/useTheme';
import { useEntitiesStore, useLightsOnCount } from '@/stores/entities';
import { useEditMode, usePreferencesStore } from '@/stores/preferences';
import { TemplateRoot } from '@/templates/TemplateRoot';
import { useActiveTemplate } from '@/templates/registry';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  useHaSocket();
  useThemeSync();
  const connection = useEntitiesStore((s) => s.connection);
  const lightsOn = useLightsOnCount();
  const editMode = useEditMode();
  const setEditMode = usePreferencesStore((s) => s.setEditMode);
  const { theme, toggle: toggleTheme } = useTheme();
  const template = useActiveTemplate();
  const isGlass = template.id === 'glass';

  return (
    <TemplateRoot>
    <div className={`relative z-[2] min-h-screen text-foreground ${isGlass ? '' : 'bg-background'}`}>
      <header className={`sticky top-0 z-20 border-b backdrop-blur ${isGlass ? 'bg-white/40 border-white/40' : 'bg-background/80'}`}>
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
            <button
              type="button"
              onClick={() => setEditMode(!editMode)}
              aria-pressed={editMode}
              aria-label={editMode ? 'Salir de modo edición' : 'Entrar a modo edición'}
              className={`flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
                editMode
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted'
              }`}
            >
              <Pencil className="h-3 w-3" />
              {editMode ? 'Editando' : 'Editar'}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
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
    </TemplateRoot>
  );
}
