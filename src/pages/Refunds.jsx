import { useState } from 'react';
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

export function Refunds() {
  const toast = useToast();
  const [requested, setRequested] = useState(initRequested);
  const [approval, setApproval] = useState(initApproval);
  const [resolved, setResolved] = useState(initResolved);
  const [resolvedCount, setResolvedCount] = useState(6);

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

  const handleApprove = () => {
    if (!managerPin.trim()) return;
    setApproval(approval.filter((r) => r.id !== drawerRefund.id));
    setResolved([drawerRefund, ...resolved]);
    setResolvedCount((c) => c + 1);
    setDrawerOpen(false);
    toast.success(`Refund approved · ${drawerRefund.amount}`);
  };

  const handleDeny = () => {
    if (!managerPin.trim() || !denyReason.trim()) return;
    setApproval(approval.filter((r) => r.id !== drawerRefund.id));
    setResolved([{ ...drawerRefund, tag: drawerRefund.tag }, ...resolved]);
    setResolvedCount((c) => c + 1);
    setDrawerOpen(false);
    toast.error(`Refund denied`);
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
            id={r.id}
            tag={r.tag}
            right={r.age}
            footer={
            <>
                  <Button size="sm" variant="outline" onClick={() => {
                    setRequested(requested.filter((x) => x.id !== r.id));
                    setResolved([{ ...r }, ...resolved]);
                    setResolvedCount((c) => c + 1);
                    toast.error(`Refund ${r.id} denied`);
                  }}>
                    Deny
                  </Button>
                  <Button size="sm" variant="dark" onClick={() => {
                    setRequested(requested.filter((x) => x.id !== r.id));
                    setApproval([r, ...approval]);
                    toast(`Refund ${r.id} sent for approval`);
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
            id={r.id}
            tag={r.tag}
            right={r.age}
            accent="amber"
            badge={
            r.locked ?
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-1 text-[11px] font-semibold text-meta">
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
            id={r.id}
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
        subtitle={drawerRefund ? `${drawerRefund.id} · ${drawerRefund.tag}` : ''}
        footer={
          !drawerReadOnly && drawerMode === 'approve' ? (
            <Button variant="dark" full onClick={handleApprove} disabled={!managerPin.trim()}>Approve</Button>
          ) : !drawerReadOnly && drawerMode === 'deny' ? (
            <Button variant="red" full onClick={handleDeny} disabled={!managerPin.trim() || !denyReason.trim()}>Deny refund</Button>
          ) : undefined
        }>
        {drawerRefund && (
          <div className="space-y-4">
            <InfoLine label="Original:">{drawerRefund.amount}</InfoLine>
            <InfoLine label="Transaction ref:">{drawerRefund.id}</InfoLine>
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

            <Field label="Manager PIN">
              <input
                type="password"
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value)}
                placeholder="Enter PIN"
                disabled={drawerReadOnly}
                className={inputClass} />
            </Field>

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
