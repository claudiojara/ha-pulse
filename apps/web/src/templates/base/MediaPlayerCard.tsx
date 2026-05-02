import {
  ChevronDown,
  ChevronUp,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { MEDIA_PLAYER_FEATURES, useMediaPlayer } from '@/hooks/entities';
import { useThrottle } from '@/hooks/useThrottle';
import { cn } from '@/lib/utils';

interface MediaPlayerCardProps {
  entityId: string;
}

const VOLUME_THROTTLE_MS = 150;
const FEAT = MEDIA_PLAYER_FEATURES;

export function MediaPlayerCard({ entityId }: MediaPlayerCardProps) {
  const {
    entity,
    state,
    isUnavailable,
    isOff,
    isPlaying,
    muted,
    has,
    title,
    artist,
    album,
    artworkUrl,
    position,
    duration,
    hasMedia,
    togglePlayPause,
    previousTrack,
    nextTrack,
    volumePct,
    setVolumePct,
    toggleMute,
  } = useMediaPlayer(entityId);

  // State UI-only.
  const [draggingPct, setDraggingPct] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Reset dragging si HA confirma cambio externo.
  useEffect(() => {
    setDraggingPct(null);
  }, [volumePct]);

  const setVolumeThrottled = useThrottle(setVolumePct, VOLUME_THROTTLE_MS);

  if (!entity) return null;

  const displayPct = draggingPct ?? volumePct;
  const canExpand = hasMedia && !isUnavailable && !isOff;

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
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide',
                isPlaying
                  ? 'bg-primary/15 text-primary'
                  : isUnavailable
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-muted/60 text-muted-foreground',
              )}
            >
              {state}
            </span>
            {canExpand && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={expanded ? 'Colapsar' : 'Expandir'}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {hasMedia && expanded && (
          <div className="flex flex-col items-center gap-3 rounded-md bg-muted/40 p-3">
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={title ?? 'artwork'}
                className="aspect-square w-full max-w-[240px] rounded object-cover shadow-md"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="flex aspect-square w-full max-w-[240px] items-center justify-center rounded bg-muted text-muted-foreground">
                <Music className="h-12 w-12" />
              </div>
            )}
            <div className="w-full min-w-0 text-center">
              {title && <div className="truncate text-base font-medium">{title}</div>}
              {artist && <div className="truncate text-sm text-muted-foreground">{artist}</div>}
              {album && (
                <div className="truncate text-xs text-muted-foreground/80">{album}</div>
              )}
            </div>
            {has(FEAT.SEEK) && typeof duration === 'number' && duration > 0 && (
              <div className="flex w-full items-center gap-2 text-xs tabular-nums text-muted-foreground">
                <span className="w-10 text-right">{formatTime(position ?? 0)}</span>
                <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary"
                    style={{
                      width: `${Math.min(100, ((position ?? 0) / duration) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-10">{formatTime(duration)}</span>
              </div>
            )}
          </div>
        )}

        {hasMedia && !expanded && (
          <div className="flex min-w-0 items-center gap-3 rounded-md bg-muted/40 p-2">
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={title ?? 'artwork'}
                className="h-12 w-12 shrink-0 rounded object-cover"
                onError={(e) => {
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
              <IconButton onClick={() => void previousTrack()} aria-label="Anterior">
                <SkipBack className="h-4 w-4" />
              </IconButton>
            )}
            {has(FEAT.PLAY | FEAT.PAUSE) && (
              <IconButton
                onClick={() => void togglePlayPause()}
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </IconButton>
            )}
            {has(FEAT.NEXT_TRACK) && (
              <IconButton onClick={() => void nextTrack()} aria-label="Siguiente">
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
                onClick={() => void toggleMute()}
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
              onValueChange={(values) => {
                const pct = values[0] ?? 0;
                setDraggingPct(pct);
                setVolumeThrottled(pct);
              }}
              onValueCommit={(values) => {
                const pct = values[0] ?? 0;
                setDraggingPct(null);
                void setVolumePct(pct);
              }}
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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
