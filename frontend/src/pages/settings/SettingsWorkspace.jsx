import { useEffect, useMemo, useState } from 'react';
import {
  BellRingIcon,
  ChefHatIcon,
  GlobeIcon,
  KeyRoundIcon,
  PrinterIcon,
  ReceiptIcon,
  SaveIcon,
  StoreIcon,
  TriangleAlertIcon,
  WalletIcon
} from 'lucide-react';
import { PageHeader } from '../../components/ui/Card';
import { Settings as SettingsIcon } from 'lucide-react';
import { RestaurantSection } from './RestaurantSection';
import { OperationsSection } from './OperationsSection';
import { StaffSection } from './StaffSection';
import { PaymentsSection } from './PaymentsSection';
import { IntegrationsSection } from './IntegrationsSection';
import { ReceiptsSection } from './ReceiptsSection';
import { PrintersSection } from './PrintersSection';
import { KitchenSection } from './KitchenSection';
import { SoundSection } from './SoundSection';
import { AdvancedSection } from './AdvancedSection';

const ic = 'h-4 w-4';

/**
 * Settings is a sectioned workspace, not one giant scrolling form: a nav rail
 * on the left (stacked on mobile), one section at a time on the right. Each
 * section owns its own draft, validation and save bar, so "unsaved changes"
 * always means the section you're actually looking at.
 */
const SECTIONS = [
  { key: 'restaurant', label: 'Restaurant', icon: <StoreIcon className={ic} />, desc: 'Identity, contact & VAT', Component: RestaurantSection },
  { key: 'operations', label: 'Operations', icon: <SettingsIcon className={ic} />, desc: 'Hours & service charge', Component: OperationsSection },
  { key: 'staff', label: 'Staff', icon: <KeyRoundIcon className={ic} />, desc: 'PINs & approved terminals', Component: StaffSection },
  { key: 'payments', label: 'Payments', icon: <WalletIcon className={ic} />, desc: 'eSewa · Khalti · IME Pay', Component: PaymentsSection },
  { key: 'integrations', label: 'Integrations', icon: <GlobeIcon className={ic} />, desc: 'Email, Google & storefront', Component: IntegrationsSection },
  { key: 'receipts', label: 'Receipts', icon: <ReceiptIcon className={ic} />, desc: 'Footer & print behaviour', Component: ReceiptsSection },
  { key: 'printers', label: 'Printers', icon: <PrinterIcon className={ic} />, desc: 'Station assignments & tests', Component: PrintersSection },
  { key: 'kitchen', label: 'Kitchen', icon: <ChefHatIcon className={ic} />, desc: 'SLA, chime & auto-fire', Component: KitchenSection },
  { key: 'sound', label: 'Sound', icon: <BellRingIcon className={ic} />, desc: 'Alert sounds & volume', Component: SoundSection },
  { key: 'advanced', label: 'Advanced', icon: <TriangleAlertIcon className={ic} />, desc: 'About & reset to defaults', Component: AdvancedSection }
];

// Deep links: /settings?section=kitchen
const VALID = new Set(SECTIONS.map((s) => s.key));

export function SettingsWorkspace() {
  const [params, setParams] = useQueryParams();
  const active = VALID.has(params.get('section')) ? params.get('section') : 'restaurant';
  const [visited, setVisited] = useState(() => new Set([active]));

  useEffect(() => {
    setVisited((v) => (v.has(active) ? v : new Set([...v, active])));
  }, [active]);

  // Sections stay mounted after first visit so a half-filled draft survives
  // tab-hopping within Settings; unvisited ones don't render at all.
  const mounted = useMemo(() => SECTIONS.filter((s) => visited.has(s.key)), [visited]);

  const navigate = (key) => {
    setParams(key === 'restaurant' ? {} : { section: key }, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Settings" descriptor={`${SECTIONS.length} sections · every change saved per section`}>
        <span className="flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-bold text-meta">
          <SaveIcon className="h-3.5 w-3.5" />
          Boss &amp; manager only
        </span>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="scroll-thin flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {SECTIONS.map((s) => {
              const isActive = s.key === active;
              return (
                <li key={s.key} className="shrink-0">
                  <button
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => navigate(s.key)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ease-soft lg:min-w-[190px] ${
                      isActive
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-surface text-ink hover:border-ink/40'
                    }`}>
                    <span className={isActive ? 'text-white' : 'text-meta'}>{s.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{s.label}</span>
                      <span className={`hidden text-xs lg:block ${isActive ? 'text-white/70' : 'text-meta'}`}>
                        {s.desc}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          {mounted.map((s) => {
            const Section = s.Component;
            return (
              <div key={s.key} hidden={s.key !== active}>
                <Section />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Tiny useSearchParams wrapper so the workspace stays decoupled from the
// router import during tests.
function useQueryParams() {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));
  useEffect(() => {
    const onPop = () => setParams(new URLSearchParams(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const set = (next, { replace } = {}) => {
    const qs = new URLSearchParams(next);
    const query = qs.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    setParams(qs);
  };
  return [params, set];
}
