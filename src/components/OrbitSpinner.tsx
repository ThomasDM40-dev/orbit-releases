// Spinner orbital fluide : anneau dégradé conique + lune en orbite.
// Animé en transform (compositeur GPU) → reste fluide même si le thread JS
// est occupé (contrairement au spinner SVG qui semblait « freezer »).
export default function OrbitSpinner({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`os-spinner ${className}`} style={{ width: size, height: size }} role="status" aria-label="loading">
      <span className="os-spinner__ring" />
      <span className="os-spinner__orbit"><span className="os-spinner__moon" /></span>
    </span>
  );
}
