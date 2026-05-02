interface GlassToggleProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  'aria-label'?: string;
}

/** Toggle nativo con estilos glass — sustituye Radix Switch para fidelidad visual con HAWeb. */
export function GlassToggle({
  checked,
  onCheckedChange,
  'aria-label': ariaLabel,
}: GlassToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className="g-toggle"
      onClick={() => onCheckedChange(!checked)}
    />
  );
}
