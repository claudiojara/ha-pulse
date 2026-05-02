import { Camera as CameraIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useCamera } from '@/hooks/entities';

interface CameraCardProps {
  entityId: string;
}

/**
 * Stream MJPEG → snapshot polling → error. La transición se maneja en `useCamera`;
 * el card solo renderiza `src` directo y dispara `onMediaError` si el `<img>` falla.
 */
export function CameraCard({ entityId }: CameraCardProps) {
  const { entity, name, isUnavailable, mode, src, onMediaError } = useCamera(entityId);
  if (!entity) return null;

  const showError = isUnavailable || mode === 'error';

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video bg-muted">
        {showError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <CameraIcon className="h-6 w-6" />
            <span>{isUnavailable ? entity.state : 'sin stream'}</span>
          </div>
        ) : (
          <>
            <img
              src={src}
              alt={name}
              className="h-full w-full object-cover"
              onError={onMediaError}
            />
            {mode === 'snapshot' && (
              <span className="absolute right-1.5 top-1.5 rounded bg-background/70 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                snapshot
              </span>
            )}
          </>
        )}
      </div>
      <CardContent className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{entity.entity_id}</div>
        </div>
        <span className="shrink-0 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {entity.state}
        </span>
      </CardContent>
    </Card>
  );
}
