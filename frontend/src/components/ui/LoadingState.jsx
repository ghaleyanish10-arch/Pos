import { Spinner } from './Spinner';

/** Centered page/region loading state with an optional label. */
export function LoadingState({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 ${className}`}>
      <Spinner size={22} />
      {label && <p className="text-sm text-meta">{label}</p>}
    </div>
  );
}