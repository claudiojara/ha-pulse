import { createFileRoute } from '@tanstack/react-router';
import { LightsList } from '@/features/lights/LightsList';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Luces</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Toggle directo con optimistic update y reconciliación por WebSocket.
        </p>
      </section>
      <LightsList />
    </div>
  );
}
