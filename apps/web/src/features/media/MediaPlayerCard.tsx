import { Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { entityPictureUrl } from '@/lib/proxy';
import { callService } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useEntitiesStore, useEntity } from '@/stores/entities';

interface MediaPlayerCardProps {
  entityId: string;
}

// Bitmask de supported_features (HA media_player constants).
const FEAT = {
  PAUSE: 1,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  PLAY: 16384,
} as const;

const VOLUME_THROTTLE_MS = 150;

export function MediaPlayerCard({ entityId }: MediaPlayerCardProps) {
  const entity = useEntity(entityId);
  const setOptimistic = useEntitiesStore((s) => s.setOptimistic);
  const clearOptimistic = useEntitiesStore((s) => s.clearOptimistic);

  const [draggingPct, setDraggingPct] = useState<number | null>(null);
  const lastSentRef = useRef<number>(0);

  const handleService = useCallback(
    async (
      service: string,
      service_data?: Record<string, unknown>,
      optimisticState?: string,
    ): Promise<void> => {
      if (!entity) return;
      if (optimisticState) {
        setOptimistic(entity.entity_id, { state: optimisticState });
      }
      const result = await callService({
        domain: 'media_player',
        service,
        target: { entity_id: entity.entity_id },
        service_data,
      });
      if (!result.ok) {
        clearOptimistic(entity.entity_id);
        console.error(`[media_player.${service}] falló:`, result.error);
      }
    },
    [entity, setOptimistic, clearOptimistic],
  );

  const handleVolumeChange = useCallback(
    (values: number[]): void => {
      if (!entity || values.length === 0) return;
      const pct = values[0] ?? 0;
      setDraggingPct(pct);
      const now = Date.now();
      if (now - lastSentRef.current < VOLUME_THROTTLE_MS) return;
      lastSentRef.current = now;
      const level = pct / 100;
      setOptimistic(entity.entity_id, {
        state: entity.state,
        attributes: { volume_level: level },
      });
      void callService({
        domain: 'media_player',
        service: 'volume_set',
        target: { entity_id: entity.entity_id },
        service_data: { volume_level: level },
      });
    },
    [entity, setOptimistic],
  );

  const handleVolumeCommit = useCallback(
    (values: number[]): void => {
      if (!entity || values.length === 0) return;
      const pct = values[0] ?? 0;
      setDraggingPct(null);
      const level = pct / 100;
      setOptimistic(entity.entity_id, {
        state: entity.state,
        attributes: { volume_level: level },
      });
      void callService({
        domain: 'media_player',
        service: 'volume_set',
        target: { entity_id: entity.entity_id },
        service_data: { volume_level: level },
      });
    },
    [entity, setOptimistic],
  );

  const realVolumePct = pctFromLevel(entity?.attributes.volume_level as number | undefined);
  useEffect(() => {
    setDraggingPct(null);
  }, [realVolumePct]);

  if (!entity) return null;

  const features = (entity.attributes.supported_features as number | undefined) ?? 0;
  const has = (flag: number): boolean => (features & flag) !== 0;
  const state = entity.state;
  const isUnavailable = state === 'unavailable' || state === 'unknown';
  const isOff = state === 'off' || state === 'standby';
  const isPlaying = state === 'playing';
  const muted = entity.attributes.is_volume_muted === true;
  const title = entity.attributes.media_title as string | undefined;
  const artist = entity.attributes.media_artist as string | undefined;
  const artworkUrl = entityPictureUrl(entity.attributes.entity_picture as string | undefined);
  const displayPct = draggingPct ?? realVolumePct;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium">
              {entity.attributes.friendly_name ?? entity.entity_id}
            </div>
            <div className="truncate text-xs text-muted-foreground">{entity.entity_id}</div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide',
              isPlaying
                ? 'bg-primary/15 text-primary'
                : isUnavailable
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-muted/60 text-muted-foreground',
            )}
          >
            {state}
          </span>
        </div>

        {(title || artist || artworkUrl) && (
          <div className="flex min-w-0 items-center gap-3 rounded-md bg-muted/40 p-2">
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={title ?? 'artwork'}
                className="h-12 w-12 shrink-0 rounded object-cover"
                onError={(e) => {
                  // Si el proxy falla (host no allowed, etc), ocultar el <img>.
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                <Music className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {title && <div className="truncate text-sm font-medium">{title}</div>}
              {artist && <div className="truncate text-xs text-muted-foreground">{artist}</div>}
            </div>
          </div>
        )}

        {!isUnavailable && !isOff && (
          <div className="flex items-center gap-1">
            {has(FEAT.PREVIOUS_TRACK) && (
              <IconButton
                onClick={() => void handleService('media_previous_track')}
                aria-label="Anterior"
              >
                <SkipBack className="h-4 w-4" />
              </IconButton>
            )}
            {has(FEAT.PLAY | FEAT.PAUSE) && (
              <IconButton
                onClick={() =>
                  void handleService(
                    isPlaying ? 'media_pause' : 'media_play',
                    undefined,
                    isPlaying ? 'paused' : 'playing',
                  )
                }
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </IconButton>
            )}
            {has(FEAT.NEXT_TRACK) && (
              <IconButton
                onClick={() => void handleService('media_next_track')}
                aria-label="Siguiente"
              >
                <SkipForward className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        )}

        {!isUnavailable && has(FEAT.VOLUME_SET) && (
          <div className="flex items-center gap-2">
            {has(FEAT.VOLUME_MUTE) && (
              <button
                type="button"
                onClick={() =>
                  void handleService('volume_mute', { is_volume_muted: !muted })
                }
                className="text-muted-foreground hover:text-foreground"
                aria-label={muted ? 'Quitar mute' : 'Mute'}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
            <Slider
              value={[displayPct]}
              min={0}
              max={100}
              step={1}
              onValueChange={handleVolumeChange}
              onValueCommit={handleVolumeCommit}
              aria-label="Volumen"
            />
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
              {displayPct}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface IconButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  'aria-label': string;
}

function IconButton({ onClick, children, 'aria-label': ariaLabel }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function pctFromLevel(level: number | undefined): number {
  if (level === undefined || Number.isNaN(level)) return 0;
  return Math.max(0, Math.min(100, Math.round(level * 100)));
}
