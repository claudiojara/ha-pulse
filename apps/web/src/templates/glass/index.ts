import type { Template } from '../registry';
import { GlassBackground } from './GlassBackground';
import { LightCard } from './LightCard';
import { SensorCard } from './SensorCard';
import { SwitchCard } from './SwitchCard';

import './tokens.css';
import './theme.css';

/**
 * Glass MVP — solo 3 dominios cubiertos por ahora (light, switch, sensor).
 * Los dominios no listados caen al `UnsupportedCard` del factory hasta que
 * sumemos sus glass cards.
 */
export const glassTemplate: Template = {
  id: 'glass',
  name: 'Glass',
  description:
    'Glassmorphism inspirado en HAWeb — fondo con orbs pastel, blur fuerte, accent periwinkle.',
  Background: GlassBackground,
  cards: {
    light: LightCard,
    switch: SwitchCard,
    sensor: SensorCard,
  },
};
