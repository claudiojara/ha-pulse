import type { HassEntity } from '@dashboard-web/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraSnapshotUrl, cameraStreamUrl } from '@/lib/proxy';
import { useEntity } from '@/stores/entities';

export type CameraMode = 'stream' | 'snapshot' | 'error';

export interface UseCameraResult {
  entity: HassEntity | undefined;
  name: string;
  isUnavailable: boolean;
  mode: CameraMode;
  /** URL a poner en `<img src>` según el modo actual. */
  src: string;
  /**
   * Llamar desde `<img onError>`. Hace la transición:
   *   stream → snapshot   (si el stream MJPEG falla)
   *   snapshot → error    (si el snapshot también falla)
   */
  onMediaError: () => void;
}

const DEFAULT_SNAPSHOT_INTERVAL_MS = 3000;

/**
 * Maneja el flujo de stream → snapshot → error de cámaras HA.
 * El `<img>` recibe `src` directo y `onError` para transicionar.
 *
 * El polling de snapshot vive en este hook (setInterval con cleanup).
 */
export function useCamera(
  entityId: string,
  options?: { snapshotIntervalMs?: number },
): UseCameraResult {
  const entity = useEntity(entityId);
  const intervalMs = options?.snapshotIntervalMs ?? DEFAULT_SNAPSHOT_INTERVAL_MS;

  const [mode, setMode] = useState<CameraMode>('stream');
  const [snapshotKey, setSnapshotKey] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode !== 'snapshot') return;
    intervalRef.current = window.setInterval(() => {
      setSnapshotKey((k) => k + 1);
    }, intervalMs);
    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    };
  }, [mode, intervalMs]);

  const onMediaError = useCallback(() => {
    setMode((current) => {
      if (current === 'stream') return 'snapshot';
      if (current === 'snapshot') return 'error';
      return current;
    });
  }, []);

  const isUnavailable = entity
    ? entity.state === 'unavailable' || entity.state === 'unknown'
    : true;
  const name = entity?.attributes.friendly_name ?? entityId;

  let src = '';
  if (mode === 'stream') {
    src = cameraStreamUrl(entityId);
  } else if (mode === 'snapshot') {
    src = `${cameraSnapshotUrl(entityId)}?t=${snapshotKey}`;
  }

  return {
    entity,
    name,
    isUnavailable,
    mode,
    src,
    onMediaError,
  };
}
