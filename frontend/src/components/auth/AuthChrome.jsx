/**
 * Shared chrome for the standalone, full-viewport auth surfaces: the owner
 * landing page, the PIN terminal, and the flows that root public routes
 * (forgot password, verify email, auth callback) render without the app
 * header/rail. One badge, one token pattern, everywhere.
 */
export function BrandBadge({ children = 'M', className = '' }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ink text-base font-black text-white ${className}`}>
      {children}
    </span>
  );
}

export function BrandLogo({ title = 'Mesa OS', subtitle }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandBadge />
      <div>
        <p className="text-sm font-bold leading-tight text-ink">{title}</p>
        {subtitle && <p className="text-caption text-meta">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Full-viewport centered column that owns the whole page (brand + card). */
export function AuthShell({ children }) {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-6 px-5 py-10">
      {children}
    </div>
  );
}

/** The card that holds an auth flow. */
export function AuthCard({ children, className = '' }) {
  return (
    <div className={`w-full max-w-[400px] rounded-card border border-line bg-surface p-7 ${className}`}>
      {children}
    </div>
  );
}

/** Top bar for the larger standalone pages (landing, terminal). */
export function AuthHeader({ children }) {
  return (
    <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-4 lg:px-8">
      <BrandLogo subtitle="The operating system for your restaurant" />
      {children}
    </header>
  );
}