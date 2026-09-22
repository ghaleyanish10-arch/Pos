import { Loader2Icon } from 'lucide-react';

/** Brand spinner. Use everywhere instead of hand-rolled animate-spin icons. */
export function Spinner({ size = 16, className = '' }) {
  return (
    <Loader2Icon
      className={`animate-spin text-meta ${className}`}
      style={{ height: size, width: size }}
      aria-label="Loading"
      role="status" />
  );
}