import type { HassEntity } from '@dashboard-web/shared';
import { useCallback } from 'react';
import { entityPictureUrl } from '@/lib/proxy';
import { useEntity } from '@/stores/entities';
import { useService } from './useService';

/** Bitmask de supported_features (HA media_player constants). */
export const MEDIA_PLAYER_FEATURES = {
  PAUSE: 1,
  SEEK: 2,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  PLAY: 16384,
} as const;

export interface UseMediaPlayerResult {
  entity: HassEntity | undefined;
  state: string;
  isUnavailable: boolean;
  isOff: boolean;
  isPlaying: boolean;
  muted: boolean;

  features: number;
  has: (flag: number) => boolean;

  title: string | undefined;
  artist: string | undefined;
  album: string | undefined;
  artworkUrl: string | undefined;
  position: number | undefined;
  duration: number | undefined;
  hasMedia: boolean;

  // playback
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;

  // volume
  /** Volumen 0..100. */
  volumePct: number;
  setVolumePct: (pct: number) => Promise<void>;
  toggleMute: () => Promise<void>;
}

function pctFromLevel(level: number | undefined): number {
  if (level === undefined || Number.isNaN(level)) return 0;
  return Math.max(0, Math.min(100, Math.round(level * 100)));
}

export function useMediaPlayer(entityId: string): UseMediaPlayerResult {
  const entity = useEntity(entityId);
  const { call } = useService();

  const state = entity?.state ?? 'unavailable';
  const isUnavailable = state === 'unavailable' || state === 'unknown';
  const isOff = state === 'off' || state === 'standby';
  const isPlaying = state === 'playing';
  const muted = entity?.attributes.is_volume_muted === true;

  const features = (entity?.attributes.supported_features as number | undefined) ?? 0;
  const has = useCallback((flag: number): boolean => (features & flag) !== 0, [features]);

  const title = entity?.attributes.media_title as string | undefined;
  const artist = entity?.attributes.media_artist as string | undefined;
  const album = entity?.attributes.media_album_name as string | undefined;
  const artworkUrl = entityPictureUrl(entity?.attributes.entity_picture as string | undefined);
  const position = entity?.attributes.media_position as number | undefined;
  const duration = entity?.attributes.media_duration as number | undefined;
  const hasMedia = Boolean(title || artist || artworkUrl);
  const volumePct = pctFromLevel(entity?.attributes.volume_level as number | undefined);

  const callPlayer = useCallback(
    async (
      service: string,
      service_data?: Record<string, unknown>,
      optimisticState?: string,
    ) => {
      if (!entity) return;
      await call(
        {
          domain: 'media_player',
          service,
          target: { entity_id: entity.entity_id },
          service_data,
        },
        optimisticState ? { optimistic: { state: optimisticState } } : undefined,
      );
    },
    [entity, call],
  );

  const play = useCallback(() => callPlayer('media_play', undefined, 'playing'), [callPlayer]);
  const pause = useCallback(() => callPlayer('media_pause', undefined, 'paused'), [callPlayer]);
  const togglePlayPause = useCallback(
    () =>
      callPlayer(
        isPlaying ? 'media_pause' : 'media_play',
        undefined,
        isPlaying ? 'paused' : 'playing',
      ),
    [callPlayer, isPlaying],
  );
  const previousTrack = useCallback(() => callPlayer('media_previous_track'), [callPlayer]);
  const nextTrack = useCallback(() => callPlayer('media_next_track'), [callPlayer]);

  const setVolumePct = useCallback(
    async (pct: number) => {
      if (!entity) return;
      const level = pct / 100;
      await call(
        {
          domain: 'media_player',
          service: 'volume_set',
          target: { entity_id: entity.entity_id },
          service_data: { volume_level: level },
        },
        {
          optimistic: { state: entity.state, attributes: { volume_level: level } },
          label: 'media_player.volume_set',
        },
      );
    },
    [entity, call],
  );

  const toggleMute = useCallback(
    () => callPlayer('volume_mute', { is_volume_muted: !muted }),
    [callPlayer, muted],
  );

  return {
    entity,
    state,
    isUnavailable,
    isOff,
    isPlaying,
    muted,
    features,
    has,
    title,
    artist,
    album,
    artworkUrl,
    position,
    duration,
    hasMedia,
    play,
    pause,
    togglePlayPause,
    previousTrack,
    nextTrack,
    volumePct,
    setVolumePct,
    toggleMute,
  };
}
