// Locale & currency formatting. Money NEVER carries a hardcoded symbol —
// every amount is rendered through money()/moneyFmt() with the organization's
// ISO 4217 code from the session, and dates/numbers go through Intl so a
// Quebec or EU deployment renders fr-CA / de-DE formats without code changes.

let currentCurrency = null; // ISO 4217 from /auth/me, e.g. "NPR", "CAD"
let currentLocale = null; // BCP 47 from the browser, e.g. "en-CA"

export function setOrgCurrency(code) {
  currentCurrency = code && String(code).toUpperCase().length === 3 ? String(code).toUpperCase() : null;
}

export function getOrgCurrency() {
  return currentCurrency;
}

export function setLocale(locale) {
  currentLocale = locale || null;
}

function locale() {
  return currentLocale || (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
}

// Fallback symbol table for environments where Intl lacks the currency
// (older Safari). NPR is the launch market so it gets a curated symbol.
const FALLBACK_SYMBOLS = { NPR: 'Rs', CAD: '$', USD: '$', EUR: '€', GBP: '£' };

function currencyFallback(code) {
  return FALLBACK_SYMBOLS[code] || code + ' ';
}

/**
 * moneyFmt returns an Intl.NumberFormat formatter for the org currency,
 * cached per (currency, locale) pair.
 */
export function moneyFmt(code = currentCurrency, loc = locale()) {
  const cur = code || 'NPR';
  try {
    return new Intl.NumberFormat(loc, { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' });
  } catch {
    try {
      return new Intl.NumberFormat(loc, { style: 'currency', currency: cur });
    } catch {
      return null; // very old engines: fall back to the symbol table
    }
  }
}

/** toNum coerces any input to a finite number — NaN/null/undefined → 0. */
export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * money renders an amount as currency text: money(1250.5) → "Rs 1,250.50".
 * Accepts anything; every non-finite input (NaN, null, undefined, a
 * pre-formatted "1,250" string) renders as a clean 0-based value — "RsNaN"
 * can never leak through again.
 */
export function money(amount, code = currentCurrency) {
  const cur = (code && String(code).toUpperCase()) || currentCurrency || 'NPR';
  const value = toNum(amount);
  const fmt = moneyFmt(cur);
  if (fmt) {
    try {
      return fmt.format(value);
    } catch {
      /* fall through */
    }
  }
  const n = new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currencyFallback(cur)}${n.format(value)}`;
}

/** num formats a plain number locale-aware (no currency). */
export function num(value, opts = {}) {
  try {
    return new Intl.NumberFormat(locale(), opts).format(toNum(value));
  } catch {
    return String(value ?? 0);
  }
}

/** pct renders a percentage: pct(12.5) → "12.5%" */
export function pct(value, digits = 1) {
  return `${num(value, { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

/** date renders a date locale-aware. */
export function date(value, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
  try {
    return new Intl.DateTimeFormat(locale(), opts).format(new Date(value));
  } catch {
    return String(value ?? '');
  }
}

/** time renders a time locale-aware. */
export function time(value, opts = { hour: '2-digit', minute: '2-digit' }) {
  try {
    return new Intl.DateTimeFormat(locale(), opts).format(new Date(value));
  } catch {
    return String(value ?? '');
  }
}

/** dateTime renders both. */
export function dateTime(value, opts) {
  try {
    return new Intl.DateTimeFormat(locale(), opts || {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return String(value ?? '');
  }
}
