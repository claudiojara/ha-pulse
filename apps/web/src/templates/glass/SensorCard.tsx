import { useSensor } from '@/hooks/entities';

interface SensorCardProps {
  entityId: string;
}

/** Mapping device_class HA → identidad visual del sensor card de HAWeb. */
type AccentKey = 'temperature' | 'humidity' | 'co2' | 'pressure' | 'battery' | 'generic';

interface Accent {
  grad0: string;
  grad1: string;
  iconPaths: React.ReactNode;
}

const ACCENTS: Record<AccentKey, Accent> = {
  temperature: {
    grad0: '#fde68a',
    grad1: '#f59e0b',
    iconPaths: <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />,
  },
  humidity: {
    grad0: '#bae6fd',
    grad1: '#0284c7',
    iconPaths: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  },
  co2: {
    grad0: '#bbf7d0',
    grad1: '#16a34a',
    iconPaths: (
      <>
        <path d="M9 11a3 3 0 1 0 6 0 3 3 0 0 0-6 0" />
        <path d="M17.657 6.343A8 8 0 1 1 6.343 17.657" />
      </>
    ),
  },
  pressure: {
    grad0: '#e9d5ff',
    grad1: '#9333ea',
    iconPaths: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ),
  },
  battery: {
    grad0: '#bbf7d0',
    grad1: '#16a34a',
    iconPaths: (
      <>
        <rect x="3" y="7" width="16" height="10" rx="2" />
        <line x1="22" y1="11" x2="22" y2="13" />
      </>
    ),
  },
  generic: {
    grad0: '#c4b5fd',
    grad1: '#6d28d9',
    iconPaths: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  },
};

function pickAccent(deviceClass: string | undefined): { key: AccentKey; accent: Accent } {
  if (!deviceClass) return { key: 'generic', accent: ACCENTS.generic };
  const dc = deviceClass.toLowerCase();
  if (dc === 'temperature') return { key: 'temperature', accent: ACCENTS.temperature };
  if (dc === 'humidity') return { key: 'humidity', accent: ACCENTS.humidity };
  if (dc === 'carbon_dioxide' || dc === 'co2') return { key: 'co2', accent: ACCENTS.co2 };
  if (dc === 'pressure' || dc === 'atmospheric_pressure')
    return { key: 'pressure', accent: ACCENTS.pressure };
  if (dc === 'battery') return { key: 'battery', accent: ACCENTS.battery };
  return { key: 'generic', accent: ACCENTS.generic };
}

/** Estima un % visual para el ring según value/device_class. Decorativo. */
function estimatePercent(deviceClassKey: AccentKey, value: string): number {
  const num = Number(value);
  if (Number.isNaN(num)) return 50;
  if (deviceClassKey === 'humidity' || deviceClassKey === 'battery') {
    return Math.max(0, Math.min(100, num));
  }
  if (deviceClassKey === 'temperature') {
    // 0..40 °C → 0..100% (decorativo)
    return Math.max(0, Math.min(100, (num / 40) * 100));
  }
  if (deviceClassKey === 'co2') {
    // 400..2000 ppm → 0..100% (decorativo)
    return Math.max(0, Math.min(100, ((num - 400) / 1600) * 100));
  }
  if (deviceClassKey === 'pressure') {
    // 980..1040 hPa → 0..100% (decorativo)
    return Math.max(0, Math.min(100, ((num - 980) / 60) * 100));
  }
  return 50;
}

export function SensorCard({ entityId }: SensorCardProps) {
  const { entity, value, unit, deviceClass } = useSensor(entityId);
  if (!entity) return null;

  const name = entity.attributes.friendly_name ?? entity.entity_id;
  const location = entity.entity_id;
  const { key, accent } = pickAccent(deviceClass);
  const percent = estimatePercent(key, value);
  const gradId = `glassSensorGrad-${key}`;
  const dashLength = Math.round((percent / 100) * 285);

  return (
    <article className="glass-card g-sensor-card" aria-label={`${name}: ${value}${unit ?? ''}`}>
      <div className="g-sensor-ring-wrap">
        <div className="g-sensor-ring-svg">
          <svg width="130" height="130" viewBox="0 0 130 130" fill="none" aria-hidden="true">
            <circle cx="65" cy="65" r="60" stroke="rgba(124,111,247,0.04)" strokeWidth="6" />
            <circle
              cx="65"
              cy="65"
              r="54"
              stroke="rgba(200,195,255,0.22)"
              strokeWidth="4.5"
              strokeDasharray="285 400"
              strokeDashoffset="-46"
              strokeLinecap="round"
            />
            <circle
              cx="65"
              cy="65"
              r="54"
              stroke={`url(#${gradId})`}
              strokeWidth="4.5"
              strokeDasharray={`${dashLength} 400`}
              strokeDashoffset="-46"
              strokeLinecap="round"
            />
            <circle cx="65" cy="65" r="44.7" fill="rgba(255,255,255,0.42)" />
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={accent.grad0} />
                <stop offset="100%" stopColor={accent.grad1} />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="g-sensor-center">
          <div className="g-sensor-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: accent.grad1 }}
            >
              {accent.iconPaths}
            </svg>
          </div>
          <div className="g-sensor-value">{value}</div>
          {unit && <div className="g-sensor-unit">{unit}</div>}
        </div>
      </div>

      <div className="g-sensor-meta">
        <div className="g-sensor-name">{name}</div>
        <div className="g-sensor-loc">{location}</div>
      </div>
    </article>
  );
}
