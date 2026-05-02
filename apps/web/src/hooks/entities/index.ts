/**
 * Hooks headless por dominio HA. Cada hook devuelve datos derivados de la
 * entidad + callbacks para mutar (con optimistic updates). Son agnósticos al
 * template visual — los consumen tanto `templates/base/` como `templates/glass/`.
 */
export { useEntity } from '@/stores/entities';
export { useService } from './useService';
export type { ServiceCallOptions, UseServiceResult } from './useService';

export { useLight } from './useLight';
export type { UseLightResult } from './useLight';

export { useSwitch } from './useSwitch';
export type { UseSwitchResult } from './useSwitch';

export { useSensor } from './useSensor';
export type { UseSensorResult } from './useSensor';

export { useBinarySensor } from './useBinarySensor';
export type { UseBinarySensorResult } from './useBinarySensor';

export { useClimate } from './useClimate';
export type { HvacMode, UseClimateResult } from './useClimate';

export { useCamera } from './useCamera';
export type { CameraMode, UseCameraResult } from './useCamera';

export { useMediaPlayer, MEDIA_PLAYER_FEATURES } from './useMediaPlayer';
export type { UseMediaPlayerResult } from './useMediaPlayer';
