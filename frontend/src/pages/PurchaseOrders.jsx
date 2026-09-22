import { useState, useEffect } from 'react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs, inputClass } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { useToast } from '../components/ui/Toast';
import { suppliers } from '../data/ims';
import api from '../api/client';

const statusTone = {
  Draft: 'neutral',
  Sent: 'blue',
  'Partially Received': 'amber',
  Received: 'green'
};

const defaultNewLines = [
  { item: 'Buff mince', qty: 24, unit: 'kg', unitCost: 720, expected: 24, received: 0 },
  { item: 'Chicken breast', qty: 18, unit: 'kg', unitCost: 640, expected: 18, received: 0 },
  { item: 'Momo wrappers', qty: 600, unit: 'pcs', unitCost: 6, expected: 600, received: 0 }
];

const fromPo = (po) => ({
  id: po.id || '',
  supplier: po.supplier || '',
  count: Array.isArray(po.items) ? po.items.length : 0,
  total: `Rs ${Number(po.total || 0).toLocaleString('en-IN')}`,
  expected: po.expected_date
    ? new Date(po.expected_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : '—',
  status: po.status || 'Draft',
  raw: po
});

const toApiPoLine = (l) => ({
  ingredient: l.item || '',
  qty: Number(l.qty) || 0,
  unit_cost: Number(l.unitCost) || 0
});

export function PurchaseOrders() {
  const toast = useToast();
  const [tab, setTab] = useState('All');
  const [building, setBuilding] = useState(false);
  const [poList, setPoList] = useState([]);
  const [newSupplier, setNewSupplier] = useState('Everest Meats');
  const [newDate, setNewDate] = useState('2026-09-14');
  const [newLines, setNewLines] = useState(defaultNewLines.map((l) => ({ ...l })));
  const [receivePo, setReceivePo] = useState(null);
  const [receiveLines, setReceiveLines] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/purchase-orders');
        if (cancelled) return;
        const data = res?.data || [];
        // Honest board: whatever the server returns — including an empty list.
        setPoList(data.map(fromPo));
      } catch {
        if (!cancelled) setPoList([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = poList.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const rows = tab === 'All' ? poList : poList.filter((p) => p.status === tab);
  const total = newLines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  const updateNewLine = (index, field, value) => {
    setNewLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const addNewLine = () => {
    setNewLines((prev) => [...prev, { item: '', qty: 0, unit: 'kg', unitCost: 0, expected: 0, received: 0 }]);
  };

  const resetBuilder = () => {
    setBuilding(false);
    setNewLines(defaultNewLines.map((l) => ({ ...l })));
    setNewSupplier('Everest Meats');
    setNewDate('2026-09-14');
  };

  const handleSaveDraft = async () => {
    const expected = newDate ? new Date(newDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';
    try {
      const created = await api('/purchase-orders', {
        method: 'POST',
        body: { supplier: newSupplier, expected_date: newDate, items: newLines.map(toApiPoLine) }
      });
      setPoList((prev) => [{
        id: created.id,
        supplier: newSupplier,
        count: newLines.length,
        total: `Rs ${total.toLocaleString('en-IN')}`,
        expected,
        status: created.status || 'Draft',
        raw: { ...created, items: newLines.map(toApiPoLine) }
      }, ...prev]);
      resetBuilder();
      toast.success('Draft saved');
    } catch (err) {
      toast.error(`Draft not saved: ${err?.body?.error || err?.message || 'server rejected the PO'}`);
    }
  };

  const handleSendToSupplier = async () => {
    const expected = newDate
      ? new Date(newDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      : new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    try {
      const created = await api('/purchase-orders', {
        method: 'POST',
        body: { supplier: newSupplier, expected_date: newDate, items: newLines.map(toApiPoLine) }
      });
      // The server has no separate "send" action, so a sent PO is a persisted
      // PO whose status we move to Sent — awaited so we never claim success
      // before the server agrees.
      await api(`/purchase-orders/${created.id}`, { method: 'PUT', body: { status: 'Sent' } });
      setPoList((prev) => [{
        id: created.id,
        supplier: newSupplier,
        count: newLines.length,
        total: `Rs ${total.toLocaleString('en-IN')}`,
        expected,
        status: 'Sent',
        raw: { ...created, items: newLines.map(toApiPoLine) }
      }, ...prev]);
      resetBuilder();
      toast.success(`PO sent to ${newSupplier}`);
    } catch (err) {
      toast.error(`PO not sent: ${err?.body?.error || err?.message || 'server rejected the PO'}`);
    }
  };

  const openReceive = (po) => {
    const items = po?.raw?.items;
    if (!Array.isArray(items) || items.length === 0) {
      toast.error('Cannot receive: line items are missing for this PO');
      return;
    }
    const lines = items.map((it) => ({
      item: it.ingredient || it.name || '',
      qty: Number(it.qty) || 0,
      expected: Number(it.qty) || 0,
      received: Number(it.qty) || 0,
      unit: ''
    }));
    if (lines.some((l) => !l.item)) {
      toast.error('Cannot receive: a line item has no ingredient name');
      return;
    }
    setReceivePo(po);
    setReceiveLines(lines);
  };

  const updateReceiveLine = (index, field, value) => {
    setReceiveLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const receiveTotal = receiveLines.reduce((s, l) => s + l.received, 0);
  const receiveExpected = receiveLines.reduce((s, l) => s + l.expected, 0);
  const hasDiscrepancy = receiveLines.some((l) => l.received !== l.expected);

  const applyReceiveResponse = (res, poId) => {
    const serverPo = res?.po;
    if (!serverPo) return null;
    setPoList((prev) =>
      prev.map((p) => (p.id === poId ? { ...p, status: serverPo.status || 'Received', raw: serverPo } : p))
    );
    return serverPo;
  };

  const markFullyReceived = async () => {
    try {
      const res = await api(`/purchase-orders/${receivePo.id}/receive`, {
        method: 'PUT',
        body: { received_items: receiveLines.map((l) => ({ ingredient: l.item, qty: l.expected })) }
      });
      applyReceiveResponse(res, receivePo.id);
      setReceivePo(null);
      toast.success(res?.message || 'PO fully received');
    } catch (err) {
      toast.error(`Receive failed: ${err?.body?.error || err?.message || 'server rejected the receive'}`);
    }
  };

  const savePartial = async () => {
    const allMatch = receiveLines.every((l) => l.received === l.expected);
    try {
      const res = await api(`/purchase-orders/${receivePo.id}/receive`, {
        method: 'PUT',
        body: { received_items: receiveLines.map((l) => ({ ingredient: l.item, qty: l.received })) }
      });
      applyReceiveResponse(res, receivePo.id);
      setReceivePo(null);
      toast.success(res?.message || (allMatch ? 'PO fully received' : 'Partial receive saved'));
    } catch (err) {
      toast.error(`Receive failed: ${err?.body?.error || err?.message || 'server rejected the receive'}`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Purchase Orders"
        descriptor={`${poList.length} orders · ${counts['Partially Received'] ?? 0} partially received`}>

        <Button variant="dark" onClick={() => setBuilding((b) => !b)}>
          {building ? 'Back to list' : 'New purchase order'}
        </Button>
      </PageHeader>

      {building ?
        <Card className="mx-auto max-w-[820px]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
            <div>
              <h2 className="text-lg font-extrabold text-ink">New purchase order</h2>
              <p className="text-sm text-meta">Create a new purchase order</p>
            </div>
            <div className="flex gap-2">
              <select
                className={`${inputClass} w-auto`}
                value={newSupplier}
                onChange={(e) => setNewSupplier(e.target.value)}
              >
                {suppliers.map((s) => <option key={s}>{s}</option>)}
              </select>
              <input className={`${inputClass} w-auto`} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="Expected delivery date" />
            </div>
          </div>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 text-left text-caption font-semibold text-meta">
                  Item
                </th>
                <th className="py-2 text-right text-caption font-semibold text-meta">
                  Quantity
                </th>
                <th className="py-2 text-right text-caption font-semibold text-meta">
                  Unit cost
                </th>
                <th className="py-2 text-right text-caption font-semibold text-meta">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {newLines.map((l, i) =>
                <tr key={i} className="border-b border-line">
                  <td className="py-3 font-semibold">
                    <input
                      className="w-full bg-transparent font-semibold text-ink outline-none focus:bg-surface focus:rounded-lg focus:px-1"
                      value={l.item}
                      onChange={(e) => updateNewLine(i, 'item', e.target.value)}
                      placeholder="Item name"
                      aria-label="Item name"
                    />
                  </td>
                  <td className="py-3 text-right">
                    <input
                      className="w-20 bg-transparent text-right font-mono text-ink outline-none focus:bg-surface focus:rounded-lg focus:px-1"
                      type="number"
                      value={l.qty}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        updateNewLine(i, 'qty', val);
                        updateNewLine(i, 'expected', val);
                      }}
                      aria-label="Quantity"
                    />
                    <span className="text-meta"> {l.unit}</span>
                  </td>
                  <td className="py-3 text-right font-mono">
                    <input
                      className="w-20 bg-transparent text-right font-mono text-ink outline-none focus:bg-surface focus:rounded-lg focus:px-1"
                      type="number"
                      value={l.unitCost}
                      onChange={(e) => updateNewLine(i, 'unitCost', Number(e.target.value))}
                      aria-label="Unit cost"
                    />
                  </td>
                  <td className="py-3 text-right font-mono font-bold">
                    Rs {(l.qty * l.unitCost).toLocaleString('en-IN')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={addNewLine}>
              Add line item
            </Button>
            <p className="font-mono text-xl font-extrabold text-ink">
              Rs {total.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="mt-6 flex gap-2 border-t border-line pt-5">
            <Button variant="outline" onClick={handleSaveDraft}>
              Save draft
            </Button>
            <Button variant="dark" onClick={handleSendToSupplier}>
              Send to supplier
            </Button>
          </div>
        </Card> :

        <>
          <div className="mb-4">
            <Tabs
              options={['All', 'Draft', 'Sent', 'Partially Received', 'Received']}
              value={tab}
              onChange={setTab}
              counts={counts} />

          </div>

          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>PO</Th>
                  <Th>Supplier</Th>
                  <Th>Items</Th>
                  <Th className="text-right">Total cost</Th>
                  <Th>Expected</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((po) =>
                  <Tr key={po.id}>
                    <Td className="font-mono text-sm font-semibold">{po.id}</Td>
                    <Td className="text-sm">{po.supplier}</Td>
                    <Td className="font-mono text-sm">{po.count}</Td>
                    <Td className="text-right font-mono text-sm font-bold">{po.total}</Td>
                    <Td className="text-sm text-meta">{po.expected}</Td>
                    <Td>
                      <Pill tone={statusTone[po.status]} dot>
                        {po.status}
                      </Pill>
                    </Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReceive(po)}
                      >
                        {po.status === 'Received' ? 'Open' : 'Receive'}
                      </Button>
                    </Td>
                  </Tr>
                )}
              </tbody>
            </Table>
          </TableWrap>
        </>
      }

      <Drawer
        open={!!receivePo}
        onClose={() => setReceivePo(null)}
        title={`Receive ${receivePo?.id ?? ''}`}
        subtitle={`${receivePo?.supplier ?? ''} · ${receiveLines.length} line items`}
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-sm text-meta">
              {receiveTotal} of {receiveExpected} units
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={savePartial}>Save partial</Button>
              <Button variant="green" onClick={markFullyReceived}>Mark fully received</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {receiveLines.map((l, i) => {
            const discrepancy = l.received !== l.expected;
            return (
              <div
                key={l.item}
                className={`rounded-xl border p-3 ${discrepancy ? 'border-status-red/30 bg-status-red/5' : 'border-line bg-canvas'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{l.item}</span>
                  {discrepancy &&
                    <Pill tone="red" dot>Discrepancy</Pill>
                  }
                </div>
                <p className="mt-1 text-xs text-meta">Expected: {l.expected} {l.unit}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-caption font-semibold text-meta">Received</span>
                  <button
                    type="button"
                    onClick={() => updateReceiveLine(i, 'received', Math.max(0, l.received - 1))}
                    className="h-8 w-8 rounded-lg border border-line bg-surface text-sm font-bold text-ink"
                  >
                    −
                  </button>
                  <span className="w-16 text-center font-mono text-sm font-bold">{l.received}</span>
                  <button
                    type="button"
                    onClick={() => updateReceiveLine(i, 'received', l.received + 1)}
                    className="h-8 w-8 rounded-lg border border-line bg-surface text-sm font-bold text-ink"
                  >
                    +
                  </button>
                  <span className="text-xs text-meta"> {l.unit}</span>
                </div>
              </div>
            );
          })}
        </div>

        {hasDiscrepancy &&
          <div className="mt-4 rounded-xl border border-status-amber/30 bg-status-amber/5 p-3">
            <p className="text-xs font-semibold text-status-amber">
              {receiveLines.filter((l) => l.received !== l.expected).length} item(s) have discrepancies
            </p>
          </div>
        }
      </Drawer>
    </div>);
}