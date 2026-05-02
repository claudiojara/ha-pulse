/**
 * Capas de fondo del template glass: gradient base + 4 orbs + overlay + depth.
 * Se renderiza una sola vez cuando el template glass está activo.
 */
export function GlassBackground() {
  return (
    <div className="template-glass-bg" aria-hidden="true">
      <div className="template-glass-bg-base" />
      <div className="template-glass-bg-pattern" />
      <div className="template-glass-bg-orb template-glass-bg-orb-1" />
      <div className="template-glass-bg-orb template-glass-bg-orb-2" />
      <div className="template-glass-bg-orb template-glass-bg-orb-3" />
      <div className="template-glass-bg-orb template-glass-bg-orb-4" />
      <div className="template-glass-bg-overlay" />
      <div className="template-glass-bg-depth" />
    </div>
  );
}
