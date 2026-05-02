import { useLight } from '@/hooks/entities';
import { GlassToggle } from './GlassToggle';

interface LightCardProps {
  entityId: string;
}

const TRACK = 220;
const BULB_COLOR_DEFAULT = '#fde68a';
const BRIGHTNESS_STEP = 10;

export function LightCard({ entityId }: LightCardProps) {
  const { entity, isOn, brightnessPct, supportsBrightness, toggle, setBrightnessPct } =
    useLight(entityId);
  if (!entity) return null;

  const name = entity.attributes.friendly_name ?? entity.entity_id;
  const location = entity.entity_id;
  const progressDash = Math.round((brightnessPct / 100) * TRACK);
  const glowColor = isOn ? BULB_COLOR_DEFAULT : 'transparent';

  const bumpBrightness = (delta: number) => {
    const next = Math.max(1, Math.min(100, brightnessPct + delta));
    if (next === brightnessPct) return;
    void setBrightnessPct(next);
  };

  return (
    <article
      className={`glass-card g-light-card${isOn ? '' : ' g-light-off'}`}
      aria-label={`${name}: ${isOn ? `on, ${brightnessPct}% brightness` : 'off'}`}
      data-entity-id={entity.entity_id}
      data-domain="light"
    >
      <div className="g-light-hdr">
        <div>
          <div className="g-light-name">{name}</div>
          <div className="g-light-loc">{location}</div>
        </div>
        <GlassToggle checked={isOn} onCheckedChange={toggle} aria-label={`Toggle ${name}`} />
      </div>

      <div className="g-light-gauge-wrap" aria-label={`Brightness: ${brightnessPct}%`}>
        <svg className="g-light-gauge-svg" viewBox="0 0 148 100" fill="none" aria-hidden="true">
          <path
            d="M 10 82 A 64 64 0 0 1 138 82"
            stroke="rgba(200,195,255,0.22)"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 10 82 A 64 64 0 0 1 138 82"
            stroke="url(#lightCardGrad)"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${progressDash} 300`}
            pathLength="220"
          />
          <defs>
            <linearGradient id="lightCardGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
        </svg>

        <div className="g-light-bulb-wrap">
          <div
            className="g-light-glow-ring"
            style={{ boxShadow: `0 0 14px 3px ${glowColor}` }}
            aria-hidden="true"
          />
          <svg
            className="g-light-bulb"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <ellipse
              className="g-bulb-glow-outer"
              cx="12"
              cy="21"
              rx="5.5"
              ry="2.5"
              fill="#f59e0b"
              stroke="none"
            />
            <ellipse
              className="g-bulb-glow-inner"
              cx="12"
              cy="20.5"
              rx="2.8"
              ry="1.3"
              fill="#fde68a"
              stroke="none"
            />
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17H8v-2.26A7 7 0 0 1 12 2z" />
          </svg>
        </div>

        <div className="g-light-pct-row">
          <span className="g-light-pct">{brightnessPct}</span>
          <span className="g-light-pct-unit">%</span>
        </div>
      </div>

      {supportsBrightness && (
        <div className="g-light-controls">
          <div
            className="g-light-color-dot"
            style={{ background: isOn ? BULB_COLOR_DEFAULT : '#c8d0e0' }}
            aria-label="Light color"
          />
          <div className="g-light-dim-btns">
            <button
              type="button"
              className="g-light-btn"
              onClick={() => bumpBrightness(-BRIGHTNESS_STEP)}
              disabled={!isOn || brightnessPct <= 1}
              aria-label="Decrease brightness"
            >
              −
            </button>
            <span className="g-light-dim-label">Brightness</span>
            <button
              type="button"
              className="g-light-btn"
              onClick={() => bumpBrightness(BRIGHTNESS_STEP)}
              disabled={!isOn || brightnessPct >= 100}
              aria-label="Increase brightness"
            >
              +
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
