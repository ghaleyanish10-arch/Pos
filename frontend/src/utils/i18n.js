// Translation layer: every user-facing string goes through t() so French
// (Quebec/Canada) and other locales can be added later without a rewrite.
// Only English is populated; missing keys fall back to the key itself, so a
// new language can land key-by-key.

import { useEffect, useState } from 'react';

const catalogs = {
  en: {},
  // fr: { ... } — add fr-CA keys here; t() resolves fr-CA → fr → en → key.
};

let activeLocale = (typeof navigator !== 'undefined' && navigator.language) || 'en';
let listeners = new Set();

function resolve(locale, key) {
  const parts = String(locale).split('-');
  while (parts.length > 0) {
    const cat = catalogs[parts.join('-').toLowerCase()];
    if (cat && Object.prototype.hasOwnProperty.call(cat, key)) return cat[key];
    parts.pop();
  }
  if (catalogs.en && Object.prototype.hasOwnProperty.call(catalogs.en, key)) return catalogs.en[key];
  return null;
}

/**
 * t translates a key with optional {placeholder} interpolation:
 *   t('order.ready_in', { minutes: 4 }) → "Ready in 4 min"
 * Unknown keys return the key itself — never an empty screen.
 */
export function t(key, params) {
  let str = resolve(activeLocale, key);
  if (str == null) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

/** setLocale switches the UI language and notifies subscribers. */
export function setI18nLocale(locale) {
  if (!locale || locale === activeLocale) return;
  activeLocale = locale;
  listeners.forEach((fn) => fn(locale));
}

export function getI18nLocale() {
  return activeLocale;
}

/** useT subscribes a component to locale changes: const tt = useT(); */
export function useT() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return t;
}
