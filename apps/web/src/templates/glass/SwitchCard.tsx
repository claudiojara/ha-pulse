import { useSwitch } from '@/hooks/entities';
import { GlassToggle } from './GlassToggle';

interface SwitchCardProps {
  entityId: string;
}

export function SwitchCard({ entityId }: SwitchCardProps) {
  const { entity, isOn, toggle } = useSwitch(entityId);
  if (!entity) return null;

  const name = entity.attributes.friendly_name ?? entity.entity_id;
  const location = entity.entity_id;

  return (
    <article
      className={`glass-card g-sw-card${isOn ? ' g-sw-on' : ''}`}
      aria-label={`${name} switch, currently ${isOn ? 'on' : 'off'}`}
      data-entity-id={entity.entity_id}
      data-domain="switch"
    >
      <div className="g-sw-hdr">
        <div>
          <div className="g-sw-name">{name}</div>
          <div className="g-sw-loc">{location}</div>
        </div>
        <GlassToggle checked={isOn} onCheckedChange={toggle} aria-label={`Toggle ${name}`} />
      </div>

      <div className="g-sw-icon-wrap" aria-hidden="true">
        <div className="g-sw-icon-bg">
          <svg
            className="g-sw-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Plug icon — default para switches genéricos */}
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
            <rect x="8" y="8" width="8" height="8" rx="1" />
          </svg>
        </div>
        {isOn && <div className="g-sw-glow" aria-hidden="true" />}
      </div>

      <div className="g-sw-state">
        <div className={`g-sw-dot${isOn ? ' g-sw-dot-on' : ''}`} />
        <span>{isOn ? 'On' : 'Off'}</span>
      </div>
    </article>
  );
}
