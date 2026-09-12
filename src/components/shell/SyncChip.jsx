import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, ClockIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '../ui/Button';

const queued = [
{ id: 'q1', ref: 'TXN-8841 · Table 12', amount: 'Rs 2,480', queuedAt: '2 min ago', synced: false },
{ id: 'q2', ref: 'TXN-8840 · Takeaway', amount: 'Rs 640', queuedAt: '6 min ago', synced: false },
{ id: 'q3', ref: 'TXN-8839 · Table 4', amount: 'Rs 3,120', queuedAt: '11 min ago', synced: true }];


export function SyncChip({
  offline,
  onToggle



}) {
  const [open, setOpen] = useState(false);
  const pending = queued.filter((q) => !q.synced).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
        offline ?
        'border-status-amber/40 bg-tint-amber text-status-amber' :
        'border-status-green/30 bg-tint-green text-status-green'}`
        }>
        
        <span
          className={`h-2 w-2 rounded-full ${offline ? 'bg-status-amber pulse-dot' : 'bg-status-green'}`}
          aria-hidden="true" />
        
        {offline ? `Offline — ${pending} orders queued` : 'Synced'}
      </button>

      <AnimatePresence>
        {open &&
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="absolute right-0 top-11 z-30 w-[340px] rounded-card border border-line bg-surface p-4 shadow-pop">
          
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink">
                Queued transactions
              </h3>
              <span className="font-mono text-xs text-meta">{queued.length}</span>
            </div>
            <ul className="space-y-2">
              {queued.map((q) =>
            <li
              key={q.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
              
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{q.ref}</p>
                    <p className="text-xs text-meta">{q.queuedAt}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ink">{q.amount}</span>
                    {q.synced ?
                <CheckIcon className="h-4 w-4 text-status-green" aria-label="Synced" /> :

                <ClockIcon className="h-4 w-4 text-status-amber" aria-label="Queued" />
                }
                  </div>
                </li>
            )}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <Button
              size="sm"
              variant="dark"
              icon={<RefreshCwIcon className="h-3.5 w-3.5" />}
              onClick={onToggle}>
              
                Retry sync
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </motion.div>
        }
      </AnimatePresence>
    </div>);

}
