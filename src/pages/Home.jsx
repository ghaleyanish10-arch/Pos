import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DeleteIcon, StoreIcon } from 'lucide-react';
import { PageHeader, SectionHeader, Shelf } from '../components/ui/Card';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Field, inputClass, FilterChips } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { Pill } from '../components/ui/Pill';
import { StatRow } from '../components/ui/StatCard';
import { useRole, visibleGroupsFor, canAccess } from '../state/RoleContext';
import { useSettings } from '../state/SettingsContext';

const registerKeys = ['1','2','3','4','5','6','7','8','9','00','0','⌫'];
const registerOptions = ['Register 1','Register 2','Register 3'];

export function Home() {
  const toast = useToast();
  const { role } = useRole();
  const { settings } = useSettings();
  const groups = visibleGroupsFor(role);

  const quickPaths = ['/orders', '/refunds', '/transactions'];
  const quick = quickPaths
    .map((p) => groups.flatMap((g) => g.items).find((i) => i.path === p))
    .filter(Boolean);
  const restGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !quickPaths.includes(i.path)) }))
    .filter((g) => g.items.length > 0);
  const canRegister = canAccess(role, '/register');

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerInfo, setRegisterInfo] = useState(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const [floatValue, setFloatValue] = useState('5000');
  const [selectedRegister, setSelectedRegister] = useState('Register 1');
  const [cashierName, setCashierName] = useState('Riya');

  const [countedCash, setCountedCash] = useState('');

  const [grossSales] = useState('24,850');
  const [totalRefunds] = useState('1,560');
  const [expectedCash] = useState('18,200');

  const pressFloat = (k) => {
    if (k === '⌫') setFloatValue((a) => a.length > 1 ? a.slice(0, -1) : '0');
    else setFloatValue((a) => a === '0' ? k : a + k);
  };

  const pressCounted = (k) => {
    if (k === '⌫') setCountedCash((a) => a.length > 1 ? a.slice(0, -1) : '0');
    else setCountedCash((a) => a === '0' ? k : a + k);
  };

  const floatDisplay = Number(floatValue || 0).toLocaleString('en-IN');
  const countedDisplay = Number(countedCash || 0).toLocaleString('en-IN');
  const discrepancy = countedCash && countedCash !== '0' ? Number(countedCash) - Number(expectedCash.replace(/,/g,'')) : 0;
  const hasDiscrepancy = countedCash && countedCash !== '0' && discrepancy !== 0;

  const openOrders = [
    { id: '#1042', tag: 'Table 12', items: '2× Momo Jhol, 1× Chicken Chilli, 1× Ice Tea' },
    { id: '#1043', tag: 'Phone', items: '1× Thakali Set, 2× Lassi' },
    { id: '#1044', tag: 'Table 4', items: '3× Espresso, 1× Cheesecake' }
  ];

  const confirmRegister = () => {
    if (floatValue === '0') return;
    setRegisterInfo({ float: floatDisplay, register: selectedRegister, cashier: cashierName });
    setRegisterOpen(false);
    toast.success(`Register open · Rs ${floatDisplay}`);
  };

  const confirmClose = () => {
    setRegisterInfo(null);
    setCloseOpen(false);
    setCountedCash('');
    toast.success('Register closed · End of day');
  };

  const printZ = () => {
    toast.success('Z-report prepared');
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title={`${settings.name} · ${settings.businessName}`}
        descriptor="Thursday, 10 September · Service open since 11:00">

        {!registerInfo && <Button variant="outline" onClick={() => { setCloseOpen(true); setCountedCash(''); }}>Close of day</Button>}
        {!registerInfo && <Button variant="dark" onClick={() => { setRegisterOpen(true); setFloatValue('5000'); setSelectedRegister('Register 1'); setCashierName('Riya'); }}>Open register</Button>}
        {registerInfo && <Button variant="outline" onClick={() => setCloseOpen(true)}>Close of day</Button>}
      </PageHeader>

      {registerInfo && (
        <div className="mb-4 flex items-center gap-3">
          <Pill tone="green" dot>Register open</Pill>
          <span className="text-sm text-meta">Rs {registerInfo.float} · {registerInfo.register} · {registerInfo.cashier}</span>
        </div>
      )}

      <AlertBanner
        action={
        <Link to="/inventory">
            <Button size="sm" variant="red">
              Reorder now
            </Button>
          </Link>
        }
        className="mb-7">

        12 inventory items are below threshold · 1 invoice overdue by 6 days
      </AlertBanner>

      <div className="mb-7">
        <StatRow
          stats={[
          { label: "Today's total", value: 'Rs 1,86,420', meta: '+8.4% vs last Thu' },
          { label: 'Orders', value: '342', meta: '126 today · 5 open tickets' },
          { label: 'Tips', value: 'Rs 12,840', meta: 'Cash Rs 7,940 · Card Rs 4,900' },
          { label: 'On shift', value: 'Riya Sharma', meta: 'Service · since 11:00' }]
          } />
      </div>

      {(canRegister || quick.length > 0) && (
        <section className="mb-7">
          <SectionHeader index="01" title="Ordering" descriptor="Frequent actions" />

          <Shelf>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {canRegister && (
                <Link
                  to="/register"
                  className="group flex min-h-[168px] flex-col justify-between rounded-card bg-ink p-6 text-white transition-shadow duration-150 ease-soft hover:shadow-pop sm:col-span-2 xl:col-span-2">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 transition-colors duration-150 ease-soft group-hover:bg-white/15">
                    <StoreIcon className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block text-2xl font-extrabold tracking-tight">Start order</span>
                    <span className="mt-1 block text-sm text-white/60">Open register 1 · take the first order</span>
                  </span>
                </Link>
              )}

              {quick.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="group flex min-h-[168px] flex-col justify-between rounded-card border border-line bg-surface p-6 transition-all duration-150 ease-soft hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-pop">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-canvas text-ink transition-colors duration-150 ease-soft group-hover:bg-ink group-hover:text-white">
                    {item.icon}
                  </span>
                  <span>
                    <span className="flex items-center gap-2 text-lg font-bold text-ink">
                      {item.label}
                      {item.alert && <span className="h-2 w-2 rounded-full bg-status-red" />}
                    </span>
                    <span className="mt-0.5 block text-sm text-meta">{item.meta}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Shelf>
        </section>
      )}

      {restGroups.length > 0 && (
        <section>
          <SectionHeader index="02" title="More" descriptor="Everything else" />

          <Shelf>
            <div className="grid gap-x-6 gap-y-7 lg:grid-cols-2 xl:grid-cols-3">
              {restGroups.map((group) => (
                <div key={group.index}>
                  <div className="mb-2.5 flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-meta">{group.index}</span>
                    <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink">
                      {group.title}
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className="group flex items-center gap-2.5 rounded-xl border border-line bg-canvas px-3 py-2.5 transition-colors duration-150 ease-soft hover:border-ink/30 hover:bg-surface">
                        <span className="shrink-0 text-meta transition-colors duration-150 ease-soft group-hover:text-ink">
                          {item.icon}
                        </span>
                        <span className="truncate text-[13px] font-semibold text-ink">
                          {item.label}
                        </span>
                        {item.alert && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-status-red" />}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Shelf>
        </section>
      )}

      <Drawer
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title="Open register"
        subtitle="Start a new shift"
        footer={<Button variant="dark" full onClick={confirmRegister}>Confirm open</Button>}>
        <div className="space-y-5">
          <Field label="Opening float">
            <div className="flex items-center rounded-xl border border-line bg-surface px-3">
              <span className="font-mono text-sm text-meta">Rs</span>
              <span className="ml-2 flex-1 font-mono text-2xl font-extrabold text-ink">{floatDisplay}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {registerKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pressFloat(k)}
                  className="flex h-12 items-center justify-center rounded-xl border border-line bg-canvas font-mono text-lg font-bold text-ink transition-colors duration-150 ease-soft hover:bg-surface active:bg-line">
                  {k === '⌫' ? <DeleteIcon className="h-4 w-4" /> : k}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Terminal">
            <FilterChips
              options={registerOptions}
              value={selectedRegister}
              onChange={setSelectedRegister} />
          </Field>

          <Field label="Cashier name">
            <input
              type="text"
              value={cashierName}
              onChange={(e) => setCashierName(e.target.value)}
              className={inputClass} />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Close of day"
        subtitle={registerInfo ? `Rs ${registerInfo.float} · ${registerInfo.register}` : undefined}
        footer={<Button variant="dark" full onClick={confirmClose}>Confirm close</Button>}>
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-meta">Gross sales</span>
              <span className="font-mono font-bold text-ink">Rs {grossSales}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-meta">Refunds</span>
              <span className="font-mono font-bold text-status-red">−Rs {totalRefunds}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-sm">
              <span className="font-bold text-ink">Expected cash</span>
              <span className="font-mono font-extrabold text-ink">Rs {expectedCash}</span>
            </div>
          </div>

          <Field label="Counted cash">
            <div className="flex items-center rounded-xl border border-line bg-surface px-3">
              <span className="font-mono text-sm text-meta">Rs</span>
              <span className="ml-2 flex-1 font-mono text-2xl font-extrabold text-ink">{countedDisplay || '0'}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {registerKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pressCounted(k)}
                  className="flex h-12 items-center justify-center rounded-xl border border-line bg-canvas font-mono text-lg font-bold text-ink transition-colors duration-150 ease-soft hover:bg-surface active:bg-line">
                  {k === '⌫' ? <DeleteIcon className="h-4 w-4" /> : k}
                </button>
              ))}
            </div>
          </Field>

          {hasDiscrepancy && (
            <div className="rounded-xl border border-status-red bg-tint-red p-3 text-sm font-semibold text-status-red">
              Discrepancy: {discrepancy > 0 ? '+' : ''}Rs {discrepancy.toLocaleString('en-IN')}
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Open orders (blocking close)</p>
            <div className="space-y-2">
              {openOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5">
                  <div>
                    <span className="text-sm font-bold text-ink">{o.id}</span>
                    <span className="ml-2 text-xs text-meta">{o.tag}</span>
                  </div>
                  <span className="text-xs text-meta">{o.items}</span>
                </div>
              ))}
            </div>
          </div>

          <Button variant="outline" full onClick={printZ}>Print Z-report</Button>
        </div>
      </Drawer>
    </div>);

}
