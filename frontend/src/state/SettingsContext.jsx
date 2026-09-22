import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/client';

export const DEFAULT_SETTINGS = {
  name: 'Mesa',
  businessName: 'Thamel House',
  address: 'Purandhara Marg, Lazimpat',
  city: 'Kathmandu',
  phone: '01-4471200',
  email: 'hello@mesa.os',
  currency: 'Rs',
  taxName: 'VAT',
  taxRate: 13,
  serviceCharge: 10,
  opening: '08:00',
  closing: '22:00',
  vatNo: '601234567',
  // Operations / Receipts / Kitchen — consumed across pages, persisted locally.
  receiptFooter: 'Thank you for dining with us!',
  receiptThanks: '',
  printKotOnCharge: true,
  autoPrintReceipts: true,
  kitchenSla: 15,
  kitchenSound: true,
  kitchenAutoFire: false,
  onlineStoreUrl: 'thamelhouse.order.np'
};

const SettingsContext = createContext(null);

// Live storefront config — the same set of values the Online Store page edits
// and the customer register renders, kept in sync across tabs.
const STOREFRONT_KEY = 'mesa_storefront';
export const DEFAULT_STOREFRONT = { accent: '#1C1B19', open: true, showPhotos: true, showAllergens: false };
const readStorefront = () => {
  try {
    const raw = localStorage.getItem(STOREFRONT_KEY);
    return raw ? { ...DEFAULT_STOREFRONT, ...JSON.parse(raw) } : DEFAULT_STOREFRONT;
  } catch {
    return DEFAULT_STOREFRONT;
  }
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem('mesa_ops_settings');
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [storefront, setStorefrontState] = useState(readStorefront);

  useEffect(() => {
    try {
      localStorage.setItem('mesa_ops_settings', JSON.stringify(settings));
    } catch {
      /* storage full/blocked — context state still works this session */
    }
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STOREFRONT_KEY, JSON.stringify(storefront));
  }, [storefront]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STOREFRONT_KEY || !e.newValue) return;
      try {
        setStorefrontState({ ...DEFAULT_STOREFRONT, ...JSON.parse(e.newValue) });
      } catch {
        /* ignore malformed payloads */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setStorefront = useCallback((patch) => {
    setStorefrontState((s) => ({ ...s, ...patch }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/store/settings');
        if (cancelled || !res) return;
        setSettings((s) => ({
          ...s,
          theme: res.theme || s.theme,
          paymentMethods: res.payment_methods || s.paymentMethods,
          deliveryZones: res.delivery_zones || s.deliveryZones
        }));
      } catch {
        /* keep static defaults as fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    const apiPayload = {};
    if (patch.theme !== undefined) apiPayload.theme = patch.theme;
    if (patch.paymentMethods !== undefined) apiPayload.payment_methods = patch.paymentMethods;
    if (patch.deliveryZones !== undefined) apiPayload.delivery_zones = patch.deliveryZones;
    if (Object.keys(apiPayload).length > 0) {
      api('/store/settings', { method: 'PUT', body: apiPayload }).catch(() => {});
    }
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    api('/store/settings', {
      method: 'PUT',
      body: {
        theme: DEFAULT_SETTINGS.theme || 'default',
        payment_methods: [{ name: 'Cash' }, { name: 'Card' }, { name: 'QR/Wallet' }],
        delivery_zones: []
      }
    }).catch(() => {});
    try {
      localStorage.removeItem('mesa_ops_settings');
    } catch {
      /* ignore */
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, update, reset, storefront, setStorefront }}>
      {children}
    </SettingsContext.Provider>);

}

export function useSettings() {
  return useContext(SettingsContext);

}