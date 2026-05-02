import type { Template } from '../registry';
import { BinarySensorCard } from './BinarySensorCard';
import { CameraCard } from './CameraCard';
import { ClimateCard } from './ClimateCard';
import { LightCard } from './LightCard';
import { MediaPlayerCard } from './MediaPlayerCard';
import { SensorCard } from './SensorCard';
import { SwitchCard } from './SwitchCard';

export const baseTemplate: Template = {
  id: 'base',
  name: 'Base',
  description: 'Cards minimalistas con tokens del sistema (default).',
  cards: {
    light: LightCard,
    switch: SwitchCard,
    sensor: SensorCard,
    binary_sensor: BinarySensorCard,
    climate: ClimateCard,
    camera: CameraCard,
    media_player: MediaPlayerCard,
  },
};
