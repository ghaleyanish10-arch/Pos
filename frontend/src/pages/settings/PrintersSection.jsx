import { useEffect, useState } from 'react';
import { PlusIcon, PrinterIcon, Trash2Icon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, inputClass } from '../../components/ui/Controls';
import { Pill } from '../../components/ui/Pill';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { ConfirmTyped } from './settingsKit';
import api from '../../api/client';

// Station → printer assignments. Config-only until driver integration; the
// test button reports honestly that nothing physical is sent yet.
export function PrintersSection() {
  const toast = useToast();
  const [printers, setPrinters] = useState(null);
  const [newPrinter, setNewPrinter] = useState({ station: '', printer: '', role: 'kot' });
  const [testedId, setTestedId] = useState(null);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api('/printers')
      .then((res) => { if (!cancelled) setPrinters(res?.data || []); })
      .catch(() => { if (!cancelled) setPrinters([]); });
    return () => { cancelled = true; };
  }, []);

  const addPrinter = async () => {
    if (!newPrinter.station.trim() || !newPrinter.printer.trim()) return;
    try {
      const res = await api('/printers', { method: 'POST', body: newPrinter });
      setPrinters((prev) => [...(prev || []), res?.data || newPrinter]);
      setNewPrinter({ station: '', printer: '', role: 'kot' });
      toast('Printer assigned', { tone: 'green' });
    } catch (e) {
      toast(e.message || 'Failed to save printer', { tone: 'red' });
    }
  };

  const removePrinter = async (p) => {
    try {
      await api(`/printers/${p.id}`, { method: 'DELETE' });
      setPrinters((prev) => prev?.filter((x) => x.id !== p.id) || []);
      toast(`Unassigned ${p.station} · ${p.role}`, { tone: 'dark' });
    } catch (e) {
      toast(e.message || 'Failed to remove printer', { tone: 'red' });
    } finally {
      setRemoving(null);
    }
  };

  const testPrinter = async (p) => {
    try {
      const res = await api(`/printers/${p.id}/test`, { method: 'POST' });
      setTestedId(p.id);
      toast(res?.message || `Test queued for ${p.printer}`, { tone: 'green' });
      setTimeout(() => setTestedId((id) => (id === p.id ? null : id)), 2500);
    } catch (e) {
      toast(e.message || 'Test failed', { tone: 'red' });
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Printer assignments</h2>
        <p className="mt-1 text-sm text-meta">
          Which printer each station's KOT and receipt output goes to — config only until driver integration.
        </p>
        <div className="mt-4">
          {printers === null ? (
            <div className="flex items-center gap-2 py-6 text-sm text-meta"><Spinner className="h-4 w-4" /> Loading printers…</div>
          ) : printers.length === 0 ? (
            <EmptyState
              compact
              icon={<PrinterIcon className="h-6 w-6" />}
              title="No printers assigned yet"
              description="Add one below — typically Kitchen (KOT) and Register 1 (Receipt)." />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-canvas">
              {printers.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tint-blue text-status-blue">
                    <PrinterIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{p.station}</span>
                    <span className="block truncate text-xs text-meta">{p.printer}</span>
                  </span>
                  <Pill tone={p.role === 'kot' ? 'amber' : 'green'} dot>
                    {p.role === 'kot' ? 'KOT' : 'Receipt'}
                  </Pill>
                  {testedId === p.id && <Pill tone="green" dot>Test OK</Pill>}
                  <Button size="sm" variant="outline" onClick={() => testPrinter(p)}>
                    Test print
                  </Button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.station} ${p.role} assignment`}
                    onClick={() => setRemoving(p)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-meta transition-colors duration-150 ease-soft hover:bg-tint-red hover:text-status-red">
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Field label="Station">
            <input
              className={inputClass}
              value={newPrinter.station}
              onChange={(e) => setNewPrinter((p) => ({ ...p, station: e.target.value }))}
              placeholder="e.g. Register 1 / Kitchen" />
          </Field>
          <Field label="Printer name">
            <input
              className={inputClass}
              value={newPrinter.printer}
              onChange={(e) => setNewPrinter((p) => ({ ...p, printer: e.target.value }))}
              placeholder="e.g. EPSON-KOT-BAR" />
          </Field>
          <Field label="Output">
            <select
              className={inputClass}
              value={newPrinter.role}
              onChange={(e) => setNewPrinter((p) => ({ ...p, role: e.target.value }))}>
              <option value="kot">KOT</option>
              <option value="receipt">Receipt</option>
            </select>
          </Field>
          <div className="flex items-end">
            <Button variant="dark" onClick={addPrinter} disabled={!newPrinter.station.trim() || !newPrinter.printer.trim()}>
              <PlusIcon className="h-4 w-4 mr-1.5" />
              Assign
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmTyped
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove this assignment?"
        body={`${removing?.station || 'This station'} will print ${removing?.role === 'kot' ? 'kitchen tickets' : 'receipts'} to nowhere until a printer is assigned again.`}
        confirmWord="remove"
        confirmLabel="Remove assignment"
        onConfirm={() => removePrinter(removing)} />
    </div>
  );
}
