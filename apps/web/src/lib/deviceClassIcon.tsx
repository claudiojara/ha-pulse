import {
  Activity,
  AlertTriangle,
  Battery,
  BatteryCharging,
  CircleHelp,
  Clock,
  DoorClosed,
  DoorOpen,
  Droplet,
  Droplets,
  Flame,
  Gauge,
  Hash,
  type LucideIcon,
  Move,
  Plug,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Square,
  SquareDashedBottom,
  Sun,
  Thermometer,
  Timer,
  Vibrate,
  Volume2,
  Wifi,
  WifiOff,
  Wind,
  Zap,
  ZapOff,
} from 'lucide-react';

/**
 * Devuelve el ícono de Lucide apropiado para una entidad según su dominio,
 * device_class y estado (cuando aplica).
 *
 * Para binary_sensors el ícono cambia según on/off (ej: door open vs closed).
 */
export function getDeviceClassIcon(
  domain: string,
  deviceClass: string | undefined,
  on?: boolean,
): LucideIcon {
  if (domain === 'binary_sensor') {
    return binarySensorIcon(deviceClass, on ?? false);
  }
  if (domain === 'sensor') {
    return sensorIcon(deviceClass);
  }
  return CircleHelp;
}

function binarySensorIcon(deviceClass: string | undefined, on: boolean): LucideIcon {
  switch (deviceClass) {
    case 'motion':
    case 'occupancy':
    case 'presence':
      return Activity;
    case 'door':
      return on ? DoorOpen : DoorClosed;
    case 'window':
    case 'opening':
      return on ? SquareDashedBottom : Square;
    case 'moisture':
      return Droplet;
    case 'battery':
      return Battery;
    case 'smoke':
    case 'gas':
      return Flame;
    case 'safety':
      return on ? ShieldAlert : ShieldCheck;
    case 'problem':
      return AlertTriangle;
    case 'connectivity':
      return on ? Wifi : WifiOff;
    case 'power':
    case 'plug':
      return on ? Plug : ZapOff;
    case 'light':
      return Sun;
    case 'vibration':
      return Vibrate;
    case 'sound':
      return Volume2;
    default:
      return CircleHelp;
  }
}

function sensorIcon(deviceClass: string | undefined): LucideIcon {
  switch (deviceClass) {
    case 'temperature':
      return Thermometer;
    case 'humidity':
      return Droplets;
    case 'battery':
      return Battery;
    case 'power':
    case 'current':
    case 'voltage':
    case 'apparent_power':
    case 'reactive_power':
      return Zap;
    case 'energy':
      return BatteryCharging;
    case 'illuminance':
      return Sun;
    case 'pressure':
    case 'atmospheric_pressure':
      return Gauge;
    case 'signal_strength':
      return Signal;
    case 'timestamp':
    case 'date':
      return Clock;
    case 'duration':
      return Timer;
    case 'distance':
      return Ruler;
    case 'speed':
      return Move;
    case 'wind_speed':
      return Wind;
    default:
      return Hash;
  }
}

/**
 * Label semántico para binary_sensor según device_class y estado.
 * Si no matcheamos, fallback a "encendido"/"apagado".
 */
export function binarySensorStateLabel(
  deviceClass: string | undefined,
  on: boolean,
): string {
  switch (deviceClass) {
    case 'motion':
      return on ? 'movimiento' : 'sin movimiento';
    case 'occupancy':
    case 'presence':
      return on ? 'presencia' : 'vacío';
    case 'door':
    case 'window':
    case 'opening':
      return on ? 'abierto' : 'cerrado';
    case 'moisture':
      return on ? 'mojado' : 'seco';
    case 'smoke':
      return on ? 'humo detectado' : 'sin humo';
    case 'gas':
      return on ? 'gas detectado' : 'sin gas';
    case 'safety':
      return on ? 'inseguro' : 'seguro';
    case 'problem':
      return on ? 'problema' : 'OK';
    case 'connectivity':
      return on ? 'conectado' : 'desconectado';
    case 'battery':
      return on ? 'batería baja' : 'OK';
    case 'power':
    case 'plug':
      return on ? 'enchufado' : 'desenchufado';
    case 'light':
      return on ? 'luz detectada' : 'oscuridad';
    case 'sound':
      return on ? 'sonido' : 'silencio';
    case 'vibration':
      return on ? 'vibración' : 'estable';
    default:
      return on ? 'encendido' : 'apagado';
  }
}
