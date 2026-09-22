import { useEffect, useState } from 'react';
import { WifiIcon, WifiOffIcon } from 'lucide-react';

/**
 * Device-level connection status. Sync failures and queued writes are surfaced
 * by the data layer (offline toasts on register actions); this chip only
 * reflects the browser's real network state.
 */
export function SyncChip() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const go = () => setOnline(true);
    const stop = () => setOnline(false);
    window.addEventListener('online', go);
    window.addEventListener('offline', stop);
    return () => {
      window.removeEventListener('online', go);
      window.removeEventListener('offline', stop);
    };
  }, []);

  return (
    <span
      role="status"
      title={online ? 'Device is online' : 'Device is offline'}
      className={`hidden h-9 items-center gap-2 rounded-full border px-3 text-13 font-semibold lg:flex ${
        online
          ? 'border-status-green/30 bg-tint-green text-status-green'
          : 'border-status-amber/40 bg-tint-amber text-status-amber'
      }`}>
      {online
        ? <WifiIcon className="h-3.5 w-3.5" aria-hidden="true" />
        : <WifiOffIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{online ? 'Online' : 'Offline'}</span>
    </span>
  );
}