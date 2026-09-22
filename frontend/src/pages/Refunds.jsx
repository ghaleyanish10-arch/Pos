import { useState, useEffect } from 'react';
import { LockIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Board, BoardCard, Column, InfoLine } from '../components/ui/Kanban';
import { Button } from '../components/ui/Button';
import { CountBadge } from '../components/ui/Pill';
import { Drawer } from '../components/ui/Drawer';
import { Field, inputClass, FilterChips } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import {
  refundsRequested as initRequested,
  refundsApproval as initApproval,
  refundsResolved as initResolved } from
'../data/sell';
import api from '../api/client';
import { useTables } from '../state/TableContext';
import { useElevation, withElevation } from '../state/ElevationContext';
import { useRole } from '../state/RoleContext';
import { RestrictedState } from '../components/role/RestrictedState';

// Refunds are manager/boss only. The wrapper keeps the guard above the board
// so the board's hooks always run unconditionally (rules-of-hooks), while a
// cashier or kitchen session still gets the restricted screen even if it
// reaches the route directly. Approving a refund always needs a manager/boss
// PIN on top of that (server-enforced).
export function Refunds() {
  const { role } = useRole();
  if (role !== 'manager' && role !== 'boss') {
    return <RestrictedState pageLabel="Refunds & Returns" />;
  }
  return <RefundsBoard />;
}

function RefundsBoard() {
  const toast = useToast();
  const { labelOf } = useTables();
  const { openPrompt, clearElevationToken } = useElevation();

  const [requested, setRequested] = useState(initRequested);
  const [approval, setApproval] = useState(initApproval);
  const [resolved, setResolved] = useState(initResolved);
  const [resolvedCount, setResolvedCount] = useState(6);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/refunds');
        if (cancelled) return;
        const data = res?.data || [];
        if (data.length > 0) {
          const fromApi = (g) => ({
            id: g.id,
            // Cards are identified by the table they belong to ("Table T5"),
            // never by the raw refund UUID. A short ref is kept for the drawer.
            ref: `#${String(g.id).replace(/-/g, '').slice(0, 6).toUpperCase()}`,
            heading: g.table_name ? `Table ${labelOf(g.table_name)}` : 'Takeaway',
            tag: g.table_name ? labelOf(g.table_name) : 'Takeaway',
            items: Array.isArray(g.items) ? g.items.join(', ') : (typeof g.items === 'string' ? g.items : ''),
            reason: g.reason || '',
            amount: `Rs ${Number(g.amount || 0).toLocaleString('en-IN')}`,
            age: (() => { const m = Math.floor((Date.now() - new Date(g.created_at).getTime()) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr`; })(),
            locked: !!g.locked_by,
          });
          setRequested(data.filter((g) => g.status === 'Requested').map(fromApi));
          setApproval(data.filter((g) => g.status === 'Approved').map(fromApi));
          setResolved(data.filter((g) => g.status !== 'Requested' && g.status !== 'Approved').map(fromApi));
        }
      } catch {
        /* keep static refunds as fallback */
      }
    })();
    return () => { cancelled = true; };
  }, [labelOf]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('approve');
  const [drawerRefund, setDrawerRefund] = useState(null);

  const [refundMethod, setRefundMethod] = useState('Original tender');
  const [managerPin, setManagerPin] = useState('');
  const [denyReason, setDenyReason] = useState('');
  const [drawerReadOnly, setDrawerReadOnly] = useState(false);

  const refundMethods = ['Original tender', 'Store credit'];

  const openApproval = (r, mode, readOnly = false) => {
    setDrawerRefund(r);
    setDrawerMode(mode);
    setDrawerReadOnly(readOnly);
    setRefundMethod('Original tender');
    setManagerPin('');
    setDenyReason('');
    setDrawerOpen(true);
  };

  // Both approve and deny are privileged: the server answers
  // ELEVATION_REQUIRED, the PIN modal opens, and the call retries once with
  // the single-use elevation token. The token lives in memory only.
  const handleApprove = async () => {
    try {
      await withElevation(
        () => api(`/refunds/${drawerRefund.id}/approve`, { method: 'PUT' }),
        openPrompt,
        'refund.approve',
        `Approve refund of ${drawerRefund.amount}`,
        drawerRefund.id
      );
      clearElevationToken(); // single-use: drop it after the action
      setApproval(approval.filter((r) => r.id !== drawerRefund.id));
      setResolved([drawerRefund, ...resolved]);
      setResolvedCount((c) => c + 1);
      setDrawerOpen(false);
      toast.success(`Refund approved · ${drawerRefund.amount}`);
    } catch (e) {
      if (!e.cancelled) toast.error(e.message || 'Refund approval failed');
    }
  };

  const handleDeny = async () => {
    if (!managerPin.trim() || !denyReason.trim()) return;
    try {
      await withElevation(
        () => api(`/refunds/${drawerRefund.id}/resolve`, { method: 'PUT' }),
        openPrompt,
        'refund.resolve',
        'Deny this refund',
        drawerRefund.id
      );
      clearElevationToken();
      setApproval(approval.filter((r) => r.id !== drawerRefund.id));
      setResolved([{ ...drawerRefund, tag: drawerRefund.tag }, ...resolved]);
      setResolvedCount((c) => c + 1);
      setDrawerOpen(false);
      toast.error(`Refund denied`);
    } catch (e) {
      if (!e.cancelled) toast.error(e.message || 'Refund denial failed');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Refunds & Returns"
        descriptor={`3 awaiting boss approval · Rs 5,570 held`} />


      <Board>
        <Column title="Requested" tone="blue" count={requested.length}>
          {requested.map((r) =>
          <BoardCard
            key={r.id}
            id={r.heading || r.id}
            tag={r.tag}
            right={r.age}
            footer={
            <>
                  <Button size="sm" variant="outline" onClick={() => {
                    setRequested(requested.filter((x) => x.id !== r.id));
                    setResolved([{ ...r }, ...resolved]);
                    setResolvedCount((c) => c + 1);
                    toast.error(`Refund ${r.heading || r.id} denied`);
                  }}>
                    Deny
                  </Button>
                  <Button size="sm" variant="dark" onClick={() => {
                    setRequested(requested.filter((x) => x.id !== r.id));
                    setApproval([r, ...approval]);
                    toast(`Refund ${r.heading || r.id} sent for approval`);
                  }}>
                    Send for approval
                  </Button>
                </>
            }>

              <InfoLine>{r.items}</InfoLine>
              <InfoLine label="Reason:">{r.reason}</InfoLine>
              <InfoLine label="Original:">
                <span className="font-mono font-bold">{r.amount}</span>
              </InfoLine>
            </BoardCard>
          )}
        </Column>

        <Column title="Boss approval" tone="amber" count={approval.length}>
          {approval.map((r) =>
          <BoardCard
            key={r.id}
            id={r.heading || r.id}
            tag={r.tag}
            right={r.age}
            accent="amber"
            badge={
            r.locked ?
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-1 text-caption font-semibold text-meta">
                    <LockIcon className="h-3 w-3" />
                    Owner only
                  </span> :
            undefined
            }
            footer={
            <>
                  <Button size="sm" variant="outline" disabled={r.locked} onClick={() => openApproval(r, 'deny')}>
                    Deny
                  </Button>
                  <Button size="sm" variant="dark" disabled={r.locked} onClick={() => openApproval(r, 'approve')}>
                    Approve
                  </Button>
                </>
            }>

              <InfoLine>{r.items}</InfoLine>
              <InfoLine label="Reason:">{r.reason}</InfoLine>
              <InfoLine label="Original:">
                <span className="font-mono font-bold">{r.amount}</span>
              </InfoLine>
            </BoardCard>
          )}
        </Column>

        <Column
          title="Refunded / Rejected"
          tone="green"
          count={resolved.length}>

          <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
            <span className="text-sm font-semibold text-ink">Resolved today</span>
            <CountBadge tone="green">{resolvedCount}</CountBadge>
          </div>
          {resolved.map((r) =>
          <BoardCard
            key={r.id}
            id={r.heading || r.id}
            tag={r.tag}
            right="Refunded"
            rightTone="green"
            footer={
            <Button size="sm" variant="outline" onClick={() => openApproval(r, 'view', true)}>
                  View receipt
                </Button>
            }>

              <InfoLine>{r.items}</InfoLine>
              <InfoLine label="Reason:">{r.reason}</InfoLine>
              <InfoLine label="Refunded:">
                <span className="font-mono font-bold">{r.amount}</span>
              </InfoLine>
            </BoardCard>
          )}
        </Column>
      </Board>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'view' ? 'Refund receipt' : drawerMode === 'approve' ? 'Approve refund' : 'Deny refund'}
        subtitle={drawerRefund ? [drawerRefund.tag, drawerRefund.ref || (drawerRefund.heading ? undefined : `#${String(drawerRefund.id).slice(0, 6).toUpperCase()}`)].filter(Boolean).join(' · ') : ''}
        footer={
          !drawerReadOnly && drawerMode === 'approve' ? (
            <Button variant="dark" full onClick={handleApprove}>Approve</Button>
          ) : !drawerReadOnly && drawerMode === 'deny' ? (
            <Button variant="red" full onClick={handleDeny} disabled={!managerPin.trim() || !denyReason.trim()}>Deny refund</Button>
          ) : undefined
        }>
        {drawerRefund && (
          <div className="space-y-4">
            <InfoLine label="Original:">{drawerRefund.amount}</InfoLine>
            <InfoLine label="Table:">{drawerRefund.tag}</InfoLine>
            {!drawerRefund.heading && <InfoLine label="Refund ref:">{`#${String(drawerRefund.id).slice(0, 6).toUpperCase()}`}</InfoLine>}
            <InfoLine label="Returned:">{drawerRefund.items}</InfoLine>
            <InfoLine label="Reason:">{drawerRefund.reason}</InfoLine>

            <div className="border-t border-line pt-4">
              <Field label="Refund method">
                <FilterChips
                  options={refundMethods}
                  value={refundMethod}
                  onChange={drawerReadOnly ? () => {} : setRefundMethod} />
              </Field>
            </div>

            {drawerMode === 'deny' && !drawerReadOnly && (
              <Field label="Manager PIN">
                <input
                  type="password"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="Enter PIN"
                  disabled={drawerReadOnly}
                  className={inputClass} />
              </Field>
            )}

            {drawerMode === 'deny' && (
              <Field label="Reason for denial (required)">
                <input
                  type="text"
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="Enter reason"
                  disabled={drawerReadOnly}
                  className={inputClass} />
              </Field>
            )}
          </div>
        )}
      </Drawer>
    </div>);

}
