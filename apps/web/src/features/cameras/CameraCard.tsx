import { Camera as CameraIcon } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cameraStreamUrl } from '@/lib/proxy';
import { useEntity } from '@/stores/entities';

interface CameraCardProps {
  entityId: string;
}

/**
 * Muestra el stream MJPEG en vivo via `<img>`. El browser interpreta
 * multipart/x-mixed-replace nativo en `<img>` y va actualizando el frame.
 * Si el stream falla, fallback a un placeholder.
 */
export function CameraCard({ entityId }: CameraCardProps) {
  const entity = useEntity(entityId);
  const [errored, setErrored] = useState(false);

  if (!entity) return null;

  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown';

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video bg-muted">
        {isUnavailable || errored ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <CameraIcon className="h-6 w-6" />
            <span>{isUnavailable ? entity.state : 'sin stream'}</span>
          </div>
        ) : (
          <img
            src={cameraStreamUrl(entityId)}
            alt={entity.attributes.friendly_name ?? entityId}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        )}
      </div>
      <CardContent className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {entity.attributes.friendly_name ?? entity.entity_id}
          </div>
          <div className="truncate text-xs text-muted-foreground">{entity.entity_id}</div>
        </div>
        <span className="shrink-0 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {entity.state}
        </span>
      </CardContent>
    </Card>
  );
}
