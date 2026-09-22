import { useState, useCallback, useRef } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer
} from 'recharts';
import {
  CheckCircle2Icon,
  Loader2Icon,
  WifiOffIcon
} from 'lucide-react';
import { PageHeader, SectionHeader } from '../components/ui/Card';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { StatRow } from '../components/ui/StatCard';
import { StatusDot } from '../components/ui/Pill';
import { useToast } from '../components/ui/Toast';
import { branches } from '../data/admin';

const statusTone = {
  Online: 'green',
  Degraded: 'amber',
  Offline: 'red'
};

const strokeFor = {
  Online: '#15803D',
  Degraded: '#C2740B',
  Offline: '#D0342C'
};

const branchMeta = {
  'Bhaktapur Kiosk': {
    lastSeen: '10 Sep · 14:01',
    features: ['Offline mode active', 'Fiscal sync paused', 'Queue not draining']
  }
};

export function SystemHealth() {
  const toast = useToast();
  const [syncStates, setSyncStates] = useState(null);
  const [syncDone, setSyncDone] = useState(false);
  const timers = useRef([]);

  const offlineNode = branches.find((b) => b.status === 'Offline');
  const [incidentOpen, setIncidentOpen] = useState(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const startSync = useCallback(() => {
    clearTimers();
    setSyncDone(false);
    const states = branches.map(() => 'pending');
    setSyncStates([...states]);

    branches.forEach((_, i) => {
      const t = setTimeout(() => {
        setSyncStates((prev) => {
          const next = [...prev];
          next[i] = 'done';
          return next;
        });
        if (i === branches.length - 1) {
          setTimeout(() => {
            setSyncDone(true);
            toast.success('All nodes synced');
          }, 400);
        }
      }, (i + 1) * 700);
      timers.current.push(t);
    });
  }, [clearTimers, toast]);

  const retryNode = useCallback(() => {
    toast.success(`${offlineNode.name} connection restored`);
    setIncidentOpen(false);
  }, [offlineNode, toast]);

  const contactSupport = useCallback(() => {
    toast.info(`Support ticket opened #${Math.floor(1000 + Math.random() * 9000)}`);
  }, [toast]);

  const meta = offlineNode ? branchMeta[offlineNode.name] : null;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="System Health" descriptor="5 branches · last 24 hours">
        <Button variant="outline" onClick={startSync}>
          Sync all nodes
        </Button>
      </PageHeader>

      {syncStates && (
        <div className="mb-5 rounded-card border border-line bg-surface px-5 py-4">
          <p className="mb-3 text-sm font-semibold text-ink">
            {syncDone ? 'All nodes synced' : 'Syncing…'}
          </p>
          <div className="space-y-2">
            {branches.map((b, i) => (
              <div key={b.name} className="flex items-center gap-3 text-sm">
                {syncStates[i] === 'done' ? (
                  <CheckCircle2Icon className="h-4 w-4 text-status-green" />
                ) : (
                  <Loader2Icon className="h-4 w-4 animate-spin text-meta" />
                )}
                <span className="font-semibold text-ink">{b.name}</span>
                <span className="text-xs text-meta">{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5">
        <StatRow
          stats={[
            { label: 'Uptime', value: '99.98%', meta: 'Rolling 30 days' },
            { label: 'Avg sync latency', value: '412 ms', meta: 'Across all nodes' },
            { label: 'Offline nodes', value: '1', meta: 'Bhaktapur Kiosk' },
            { label: 'Queued transactions', value: '2', meta: 'Retrying every 60s' }
          ]}
        />
      </div>

      <AlertBanner
        className="mb-6"
        action={
          <Button size="sm" variant="red" onClick={() => setIncidentOpen(true)}>
            Node down
          </Button>
        }
      >
        Bhaktapur Kiosk has been offline for 41 minutes — 2 transactions queued locally
      </AlertBanner>

      <SectionHeader index="01" title="Branch status" descriptor="Throughput last 8 hrs" />
      <div className="rounded-card border border-line bg-surface">
        {branches.map((b, i) => (
          <div
            key={b.name}
            className={`flex flex-wrap items-center gap-4 px-5 py-4 ${i > 0 ? 'border-t border-line' : ''}`}
          >
            <StatusDot tone={statusTone[b.status]} />
            <div className="min-w-[200px] flex-1">
              <p className="text-sm font-bold text-ink">{b.name}</p>
              <p className="text-xs text-meta">
                {b.status} · latency {b.latency}
              </p>
            </div>
            <div className="h-10 w-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={b.throughput.map((v, x) => ({ x, v }))}>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={strokeFor[b.status]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      <Drawer
        open={incidentOpen}
        onClose={() => setIncidentOpen(false)}
        title="Node incident"
        subtitle={offlineNode?.name}
        footer={
          <>
            <Button variant="outline" onClick={contactSupport}>
              Contact support
            </Button>
            <Button variant="green" onClick={retryNode}>
              Retry connection
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-line bg-canvas px-4 py-3">
          <p className="text-xs font-semibold text-meta">
            Last seen
          </p>
          <p className="mt-1 font-mono text-sm text-ink">{meta?.lastSeen ?? '—'}</p>
        </div>

        {meta && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-meta">
              Affected features
            </p>
            <div className="space-y-2">
              {meta.features.map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink"
                >
                  <WifiOffIcon className="h-3.5 w-3.5 shrink-0 text-status-red" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {meta && (
          <div className="mt-4 rounded-xl border border-tint-red bg-tint-red px-4 py-3 text-sm text-status-red">
            Transactions are being queued locally and will sync when connectivity is restored.
          </div>
        )}
      </Drawer>
    </div>
  );
}
