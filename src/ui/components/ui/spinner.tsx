/**
 * Indicador de carga.
 *
 * `role="status"` lo anuncia una sola vez y el nombre accesible (`label`) es lo
 * que leen los tests y los lectores de pantalla. La animación se detiene con
 * `prefers-reduced-motion`.
 */
export function Spinner({
  label,
  className = "",
}: {
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center gap-2 text-body-sm text-fg-muted ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      />
      <span>{label}</span>
    </span>
  );
}
