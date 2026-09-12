import { useState, useMemo } from 'react';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatRow } from '../components/ui/StatCard';
import { Pill } from '../components/ui/Pill';
import { Drawer } from '../components/ui/Drawer';
import { Field, SearchInput, Toggle, inputClass } from '../components/ui/Controls';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { useToast } from '../components/ui/Toast';
import { loyaltyTiers, pointsLedger, loyaltyGuests as initialGuests } from '../data/business';

export function Loyalty() {
  const [issueOpen, setIssueOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guests, setGuests] = useState(initialGuests);
  const [search, setSearch] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [pointsInput, setPointsInput] = useState('');
  const [basedOnPurchase, setBasedOnPurchase] = useState(false);
  const [reason, setReason] = useState('');
  const toast = useToast();

  const [earnRate, setEarnRate] = useState('100');
  const [tierBronze, setTierBronze] = useState(1);
  const [tierSilver, setTierSilver] = useState(1.5);
  const [tierGold, setTierGold] = useState(2);
  const [expiryMonths, setExpiryMonths] = useState('12');
  const [thresholdBronze, setThresholdBronze] = useState('25,000');
  const [thresholdSilver, setThresholdSilver] = useState('75,000');
  const [thresholdGold, setThresholdGold] = useState('2,00,000');

  const filteredGuests = useMemo(() => {
    if (!search) return guests;
    return guests.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
  }, [guests, search]);

  const computedPoints = useMemo(() => {
    if (basedOnPurchase && selectedGuest) {
      return Math.round(selectedGuest.lastPurchase * 0.02);
    }
    return parseInt(pointsInput, 10) || 0;
  }, [basedOnPurchase, selectedGuest, pointsInput]);

  const handleIssuePoints = () => {
    if (!selectedGuest || computedPoints <= 0) return;
    setGuests((prev) =>
      prev.map((g) =>
        g.id === selectedGuest.id
          ? { ...g, balance: g.balance + computedPoints }
          : g
      )
    );
    toast(`${computedPoints} points issued to ${selectedGuest.name}`, { tone: 'green' });
    setIssueOpen(false);
    setSelectedGuest(null);
    setPointsInput('');
    setBasedOnPurchase(false);
    setReason('');
  };

  const handleSaveSettings = () => {
    toast('Program settings saved', { tone: 'green' });
    setSettingsOpen(false);
  };

  const handleDiscardSettings = () => {
    toast('Changes discarded', { tone: 'amber' });
    setSettingsOpen(false);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Loyalty" descriptor="Mesa Rewards · running since Mar 2025">
        <Button variant="outline" onClick={() => setSettingsOpen(true)}>Program settings</Button>
        <Button variant="dark" onClick={() => setIssueOpen(true)}>Issue points</Button>
      </PageHeader>

      <div className="mb-7">
        <StatRow
          stats={[
          { label: 'Members enrolled', value: '1,204', meta: '+86 this month' },
          { label: 'Points issued', value: '184,900', meta: 'This quarter' },
          { label: 'Redemption rate', value: '38%', meta: 'Healthy range 30–45%' },
          { label: 'Liability', value: 'Rs 92,450', meta: 'Unredeemed value' }]
          } />
        
      </div>

      <section className="mb-7">
        <SectionHeader index="01" title="Tiers" descriptor="Rolling 12-month spend" />
        <div className="grid gap-4 lg:grid-cols-3">
          {loyaltyTiers.map((tier, i) =>
          <Card key={tier.name} className={i === 2 ? 'border-ink' : ''}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-ink">{tier.name}</h3>
                <Pill tone={i === 2 ? 'purple' : 'neutral'}>{tier.members}</Pill>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-ink">
                {tier.perks.map((p) =>
              <li key={p} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-meta" />
                    {p}
                  </li>
              )}
              </ul>
              <Button size="sm" variant="outline" className="mt-5">
                Edit perks
              </Button>
            </Card>
          )}
        </div>
      </section>

      <SectionHeader index="02" title="Points ledger" descriptor="Recent earn & redeem" />
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Guest</Th>
              <Th>Activity</Th>
              <Th>Detail</Th>
              <Th className="text-right">Points</Th>
              <Th>When</Th>
            </tr>
          </thead>
          <tbody>
            {pointsLedger.map((row, i) =>
            <Tr key={i}>
                <Td className="font-semibold">{row.guest}</Td>
                <Td>
                  <Pill tone={row.type === 'Earned' ? 'green' : 'purple'} dot>
                    {row.type}
                  </Pill>
                </Td>
                <Td className="text-sm text-meta">{row.detail}</Td>
                <Td
                className={`text-right font-mono text-sm font-bold ${
                row.type === 'Earned' ? 'text-status-green' : 'text-status-purple'}`
                }>
                
                  {row.points}
                </Td>
                <Td className="text-sm text-meta">{row.when}</Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </TableWrap>

      <Drawer
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Issue points"
        subtitle="Add points to a guest's balance"
        footer={
          <>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="dark"
              disabled={!selectedGuest || computedPoints <= 0}
              onClick={handleIssuePoints}>
              Confirm
            </Button>
          </>
        }>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Search guest
            </p>
            <SearchInput
              placeholder="Type a name…"
              value={search}
              onChange={setSearch} />
            {filteredGuests.length > 0 && (
              <div className="mt-2 space-y-1">
                {filteredGuests.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => { setSelectedGuest(g); setSearch(g.name); }}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors duration-150 ease-soft ${
                      selectedGuest?.id === g.id
                        ? 'border-ink bg-canvas'
                        : 'border-line bg-surface hover:border-ink/40'
                    }`}>
                    <span className="font-semibold text-ink">{g.name}</span>
                    <span className="font-mono text-xs text-meta">{g.tier}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedGuest && (
            <div className="rounded-xl border border-line bg-canvas px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Current balance
              </p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-ink">
                {selectedGuest.balance.toLocaleString()} pts
              </p>
            </div>
          )}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Based on last purchase
              </p>
              <Toggle
                checked={basedOnPurchase}
                onChange={setBasedOnPurchase}
                label="Based on last purchase" />
            </div>
            {!basedOnPurchase ? (
              <Field label="Points amount">
                <input
                  type="number"
                  className={inputClass}
                  placeholder="e.g. 250"
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)} />
              </Field>
            ) : selectedGuest && (
              <div className="rounded-xl border border-line bg-canvas px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Last purchase
                </p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  Rs {selectedGuest.lastPurchase.toLocaleString('en-IN')}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Auto-computed points
                </p>
                <p className="mt-0.5 font-mono text-lg font-extrabold text-ink">
                  {computedPoints.toLocaleString()} pts
                </p>
              </div>
            )}
          </div>

          <Field label="Reason / note">
            <input
              className={inputClass}
              placeholder="e.g. Complimentary, service recovery"
              value={reason}
              onChange={(e) => setReason(e.target.value)} />
          </Field>

          {selectedGuest && computedPoints > 0 && (
            <div className="rounded-xl border border-line bg-canvas px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                New balance preview
              </p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-status-green">
                {(selectedGuest.balance + computedPoints).toLocaleString()} pts
              </p>
            </div>
          )}
        </div>
      </Drawer>

      <Drawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Program settings"
        subtitle="Configure Mesa Rewards"
        width="max-w-[560px]"
        footer={
          <>
            <Button variant="outline" onClick={handleDiscardSettings}>
              Discard
            </Button>
            <Button variant="dark" onClick={handleSaveSettings}>
              Save
            </Button>
          </>
        }>
        <div className="space-y-6">
          <div>
            <p className="text-sm font-extrabold text-ink">Earn rate</p>
            <p className="mt-1 text-sm text-meta">Points awarded per Rs spent</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-meta">1 point per</span>
              <input
                type="number"
                className="h-10 w-24 rounded-xl border border-line bg-surface px-3 text-center font-mono text-sm text-ink focus:border-ink focus:outline-none"
                value={earnRate}
                onChange={(e) => setEarnRate(e.target.value)} />
              <span className="text-sm text-meta">Rs</span>
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <p className="text-sm font-extrabold text-ink">Redemption tiers</p>
            <p className="mt-1 text-sm text-meta">Points multiplier per tier</p>
            <div className="mt-3 space-y-3">
              {[
                { label: 'Bronze', value: tierBronze, set: setTierBronze },
                { label: 'Silver', value: tierSilver, set: setTierSilver },
                { label: 'Gold', value: tierGold, set: setTierGold }
              ].map((t) => (
                <div key={t.label} className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                  <span className="text-sm font-semibold text-ink">{t.label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => t.set(Math.max(0.5, t.value - 0.5))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors duration-150 ease-soft hover:border-ink/40">
                      −
                    </button>
                    <span className="w-12 text-center font-mono text-sm font-semibold text-ink">
                      {t.value}×
                    </span>
                    <button
                      type="button"
                      onClick={() => t.set(t.value + 0.5)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors duration-150 ease-soft hover:border-ink/40">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <p className="text-sm font-extrabold text-ink">Expiry rules</p>
            <p className="mt-1 text-sm text-meta">How long points remain valid</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-meta">Points expire after</span>
              <input
                type="number"
                className="h-10 w-20 rounded-xl border border-line bg-surface px-3 text-center font-mono text-sm text-ink focus:border-ink focus:outline-none"
                value={expiryMonths}
                onChange={(e) => setExpiryMonths(e.target.value)} />
              <span className="text-sm text-meta">months</span>
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <p className="text-sm font-extrabold text-ink">Tier thresholds</p>
            <p className="mt-1 text-sm text-meta">Rolling 12-month spend to qualify</p>
            <div className="mt-3 space-y-3">
              {[
                { label: 'Bronze', value: thresholdBronze, set: setThresholdBronze },
                { label: 'Silver', value: thresholdSilver, set: setThresholdSilver },
                { label: 'Gold', value: thresholdGold, set: setThresholdGold }
              ].map((t) => (
                <div key={t.label} className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                  <span className="text-sm font-semibold text-ink">Rs {t.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-meta">Rs</span>
                    <input
                      type="text"
                      className="h-10 w-28 rounded-xl border border-line bg-surface px-3 text-right font-mono text-sm text-ink focus:border-ink focus:outline-none"
                      value={t.value}
                      onChange={(e) => t.set(e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Drawer>
    </div>);

}
