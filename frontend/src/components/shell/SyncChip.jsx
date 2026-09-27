import { useEffect, useState } from 'react';
import { CloudUploadIcon, WifiIcon, WifiOffIcon } from 'lucide-react';
import { subscribe } from '../../utils/offlineQueue';

function fmtAge(ts) {
  if (!ts) return null;
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/**
 * Real sync state, not the browser's online flag: queued-write count,
 * active replay, last successful sync, and error surfacing. Green = all
 * synced, amber = queue active, red = rejected writes need attention.
 */
export function SyncChip() {
  const [state, setState] = useState({ queued: 0, syncing: false, lastSyncedAt: null, lastError: null });
  const [online, setOnline] = useState(() => navigator.onLine);
  const [, tick] = useState(0);

  useEffect(() => subscribe(setState), []);

  useEffect(() => {
    const go = () => setOnline(true);
    const stop = () => setOnline(false);
    window.addEventListener('online', go);
    window.addEventListener('offline', stop);
    const timer = setInterval(() => tick((n) => n + 1), 30000); // refresh "x ago"
    return () => {
      window.removeEventListener('online', go);
      window.removeEventListener('offline', stop);
      clearInterval(timer);
    };
  }, []);

  const pending = state.queued > 0;
  const tone = state.lastError
    ? 'border-status-red/40 bg-tint-red text-status-red'
    : pending || !online
      ? 'border-status-amber/40 bg-tint-amber text-status-amber'
      : 'border-status-green/30 bg-tint-green text-status-green';

  let label = 'Synced';
  if (state.lastError) label = 'Sync error';
  else if (state.syncing) label = 'Syncing…';
  else if (pending) label = `${state.queued} queued`;
  else if (!online) label = 'Offline';
  else if (state.lastSyncedAt) label = `Synced ${fmtAge(state.lastSyncedAt)}`;

  const Icon = state.lastError ? WifiOffIcon : pending || state.syncing ? CloudUploadIcon : WifiIcon;
  const detail = [
    state.queued ? `${state.queued} write(s) waiting to sync` : null,
    state.lastError ? `Last sync issue: ${state.lastError}` : null,
    state.lastSyncedAt ? `Last synced ${fmtAge(state.lastSyncedAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      role="status"
      title={detail || (online ? 'Device is online' : 'Device is offline')}
      className={`hidden h-9 items-center gap-2 rounded-full border px-3 text-13 font-semibold lg:flex ${tone}`}
    >
      <Icon size={16} aria-hidden />
      {label}
    </span>
  );
}
