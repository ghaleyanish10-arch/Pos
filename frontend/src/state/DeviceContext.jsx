import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Device tiers drive three genuinely different shells rather than one layout
// that collapses. Breakpoints mirror the Tailwind scale:
//   phone   < 768px   — floor staff handheld: bottom tabs + quick actions
//   tablet  768–1023  — counter terminal: icon rail, POS-first
//   desktop >= 1024   — admin desk: full sidebar (unchanged)
const QUERIES = [
  { device: 'phone', mql: '(max-width: 767px)' },
  { device: 'tablet', mql: '(min-width: 768px) and (max-width: 1023px)' },
  { device: 'desktop', mql: '(min-width: 1024px)' }
];

const DeviceContext = createContext(null);

function readDevice() {
  for (const q of QUERIES) {
    if (typeof window !== 'undefined' && window.matchMedia(q.mql).matches) return q.device;
  }
  return 'desktop';
}

export function DeviceProvider({ children }) {
  const [device, setDevice] = useState(readDevice);

  useEffect(() => {
    const mqls = QUERIES.map((q) => window.matchMedia(q.mql));
    const sync = () => setDevice(readDevice());
    mqls.forEach((m) => m.addEventListener?.('change', sync));
    window.addEventListener('orientationchange', sync);
    return () => {
      mqls.forEach((m) => m.removeEventListener?.('change', sync));
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  const value = useMemo(
    () => ({
      device,
      isPhone: device === 'phone',
      isTablet: device === 'tablet',
      isDesktop: device === 'desktop'
    }),
    [device]
  );

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used within DeviceProvider');
  return ctx;
}