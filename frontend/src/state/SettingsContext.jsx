import { createContext, useContext, useState } from 'react';

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
  vatNo: '601234567'
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const update = (patch) =>
    setSettings((s) => ({ ...s, ...patch }));

  const reset = () => setSettings(DEFAULT_SETTINGS);

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>);

}

export function useSettings() {
  return useContext(SettingsContext);

}