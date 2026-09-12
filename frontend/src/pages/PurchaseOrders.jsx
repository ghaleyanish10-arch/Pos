import { useState } from 'react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs, inputClass } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { useToast } from '../components/ui/Toast';
import { poLineItems, purchaseOrders, suppliers } from '../data/ims';

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

export function PurchaseOrders() {
  const toast = useToast();
  const [tab, setTab] = useState('All');
  const [building, setBuilding] = useState(false);
  const [poList, setPoList] = useState(purchaseOrders);
  const [newSupplier, setNewSupplier] = useState('Everest Meats');
  const [newLines, setNewLines] = useState(defaultNewLines.map((l) => ({ ...l })));
  const [nextId, setNextId] = useState(415);
  const [receivePo, setReceivePo] = useState(null);
  const [receiveLines, setReceiveLines] = useState([]);

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

  const handleSaveDraft = () => {
    const id = `PO-${String(nextId).padStart(4, '0')}`;
    const itemCount = newLines.length;
    const totalStr = `Rs ${total.toLocaleString('en-IN')}`;
    setPoList((prev) => [...prev, { id, supplier: newSupplier, items: itemCount, total: totalStr, expected: '—', status: 'Draft' }]);
    setNextId((n) => n + 1);
    setBuilding(false);
    setNewLines(defaultNewLines.map((l) => ({ ...l })));
    toast.success('Draft saved');
  };

  const handleSendToSupplier = () => {
    const id = `PO-${String(nextId).padStart(4, '0')}`;
    const itemCount = newLines.length;
    const totalStr = `Rs ${total.toLocaleString('en-IN')}`;
    const expected = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    setPoList((prev) => [...prev, { id, supplier: newSupplier, items: itemCount, total: totalStr, expected, status: 'Sent' }]);
    setNextId((n) => n + 1);
    setBuilding(false);
    setNewLines(defaultNewLines.map((l) => ({ ...l })));
    toast.success(`PO sent to ${newSupplier}`);
  };

  const openReceive = (po) => {
    const lines = poLineItems.map((l) => ({ ...l, expected: l.qty, received: l.qty }));
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

  const markFullyReceived = () => {
    setPoList((prev) =>
      prev.map((p) =>
        p.id === receivePo.id ? { ...p, status: 'Received' } : p
      )
    );
    setReceivePo(null);
    toast.success('PO fully received');
  };

  const savePartial = () => {
    const allMatch = receiveLines.every((l) => l.received === l.expected);
    setPoList((prev) =>
      prev.map((p) =>
        p.id === receivePo.id
          ? { ...p, status: allMatch ? 'Received' : 'Partially Received' }
          : p
      )
    );
    const receivedUnits = receiveTotal;
    setReceivePo(null);
    toast.success(`Partial receive saved · ${receivedUnits} units added to inventory`);
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
              <h2 className="text-lg font-extrabold text-ink">PO-{String(nextId).padStart(4, '0')}</h2>
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
              <input className={`${inputClass} w-auto`} type="date" defaultValue="2026-09-14" />
            </div>
          </div>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Item
                </th>
                <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Quantity
                </th>
                <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Unit cost
                </th>
                <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
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
                    <Td className="font-mono text-sm">{po.items}</Td>
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
                        onClick={() => {
                          if (po.status === 'Sent' || po.status === 'Partially Received') {
                            openReceive(po);
                          }
                        }}
                      >
                        {po.status === 'Sent' || po.status === 'Partially Received' ?
                          'Receive' :
                          'Open'}
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
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Received</span>
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
            <p className="text-xs font-semibold text-amber-700">
              {receiveLines.filter((l) => l.received !== l.expected).length} item(s) have discrepancies
            </p>
          </div>
        }
      </Drawer>
    </div>);
}
