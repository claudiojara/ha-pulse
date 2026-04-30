import { Camera as CameraIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cameraSnapshotUrl, cameraStreamUrl } from '@/lib/proxy';
import { useEntity } from '@/stores/entities';

interface CameraCardProps {
  entityId: string;
}

const SNAPSHOT_INTERVAL_MS = 3000;

/**
 * Muestra el stream MJPEG en vivo via `<img>`. Si el stream falla (429 por
 * límite de conexiones, error de red, codec no soportado), cae a snapshot
 * polling cada 3s. Si la entidad está unavailable, placeholder estático.
 */
export function CameraCard({ entityId }: CameraCardProps) {
  const entity = useEntity(entityId);
  const [mode, setMode] = useState<'stream' | 'snapshot' | 'error'>('stream');
  const [snapshotKey, setSnapshotKey] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Polling de snapshot cuando estamos en modo snapshot.
  useEffect(() => {
    if (mode !== 'snapshot') return;
    intervalRef.current = window.setInterval(() => {
      setSnapshotKey((k) => k + 1);
    }, SNAPSHOT_INTERVAL_MS);
    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    };
  }, [mode]);

  if (!entity) return null;
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown';
  const name = entity.attributes.friendly_name ?? entityId;

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video bg-muted">
        {isUnavailable || mode === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <CameraIcon className="h-6 w-6" />
            <span>{isUnavailable ? entity.state : 'sin stream'}</span>
          </div>
        ) : mode === 'stream' ? (
          <img
            src={cameraStreamUrl(entityId)}
            alt={name}
            className="h-full w-full object-cover"
            onError={() => setMode('snapshot')}
          />
        ) : (
          <>
            <img
              key={snapshotKey}
              src={`${cameraSnapshotUrl(entityId)}?t=${snapshotKey}`}
              alt={name}
              className="h-full w-full object-cover"
              onError={() => setMode('error')}
            />
            <span className="absolute right-1.5 top-1.5 rounded bg-background/70 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              snapshot
            </span>
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
