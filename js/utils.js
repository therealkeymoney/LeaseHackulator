// ============================================================
//  utils.js  --  Shared utilities for Lease Hackulator v3
// ============================================================

// ---- Formatters --------------------------------------------

/**
 * Format a number as US currency "$1,234.56".
 * Returns "$0.00" for null / undefined / NaN.
 */
export function fmt(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '$0.00';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a number as a percentage "5.00%".
 * Returns "0.00%" for null / undefined / NaN.
 */
export function fmtPct(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '0.00%';
  return n.toFixed(2) + '%';
}

/**
 * Format a money factor to 5 decimal places "0.00125".
 * Returns "0.00000" for null / undefined / NaN.
 */
export function formatMoneyFactor(mf) {
  const n = parseFloat(mf);
  if (isNaN(n)) return '0.00000';
  return n.toFixed(5);
}

// ---- Parsers -----------------------------------------------

/**
 * Parse any input to a float.  Strips common currency / comma noise.
 * Returns 0 for null / undefined / empty-string / NaN results.
 */
export function getNum(val) {
  if (val === null || val === undefined) return 0;
  const str = String(val).replace(/[$,%\s]/g, '');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

// ---- Money-factor / APR conversions -------------------------

/**
 * Money factor -> APR  (MF x 2400).
 */
export function mfToApr(mf) {
  const n = parseFloat(mf);
  if (isNaN(n)) return 0;
  return n * 2400;
}

/**
 * APR -> Money factor  (APR / 2400).
 */
export function aprToMf(apr) {
  const n = parseFloat(apr);
  if (isNaN(n)) return 0;
  return n / 2400;
}

// ---- DOM helpers -------------------------------------------

/**
 * Show a toast notification.  Expects an element with id="toast" in the DOM.
 * @param {string}  message  - Text to display.
 * @param {boolean} isError  - If true, applies an error style class.
 */
export function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) {
    console.warn('[showToast] No #toast element found.');
    return;
  }
  toast.textContent = message || '';
  toast.classList.remove('toast-success', 'toast-error');
  toast.classList.add(isError ? 'toast-error' : 'toast-success');
  toast.classList.add('show');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/**
 * Safely set a value on a child element inside a card / container.
 * @param {Element} card     - Parent element to search within.
 * @param {string}  selector - CSS selector for the target input / element.
 * @param {*}       value    - Value to assign.
 */
export function setFieldValue(card, selector, value) {
  if (!card || !selector) return;
  const el = card.querySelector(selector);
  if (!el) return;
  if ('value' in el) {
    el.value = value ?? '';
  } else {
    el.textContent = value ?? '';
  }
}

/**
 * Safely get a numeric value from a child element inside a card / container.
 * @param {Element} card       - Parent element to search within.
 * @param {string}  selector   - CSS selector for the target input / element.
 * @param {number}  defaultVal - Fallback when element missing or value is NaN.
 * @returns {number}
 */
export function getFieldValue(card, selector, defaultVal = 0) {
  if (!card || !selector) return defaultVal;
  const el = card.querySelector(selector);
  if (!el) return defaultVal;
  const raw = 'value' in el ? el.value : el.textContent;
  const n = parseFloat(String(raw).replace(/[$,%\s]/g, ''));
  return isNaN(n) ? defaultVal : n;
}

// ---- General utilities -------------------------------------

/**
 * Standard debounce.  Returns a wrapper that delays `fn` by `ms` milliseconds.
 * Resets the timer on each call.
 */
export function debounce(fn, ms = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Haversine distance between two (lat, lon) points.
 * @returns {number} Distance in **miles**.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  if (
    lat1 == null || lon1 == null ||
    lat2 == null || lon2 == null
  ) return 0;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---- State sales-tax rate table ----------------------------
// Combined rates = state base + approximate average local add-on.
// Source: various 2024 tax-foundation / state-revenue summaries.

export const STATE_TAX_RATES = {
  AL: 9.24,
  AK: 1.76,
  AZ: 8.40,
  AR: 9.47,
  CA: 8.68,
  CO: 7.77,
  CT: 6.35,
  DE: 0.00,
  FL: 7.01,
  GA: 7.35,
  HI: 4.44,
  ID: 6.02,
  IL: 8.82,
  IN: 7.00,
  IA: 6.94,
  KS: 8.71,
  KY: 6.00,
  LA: 9.55,
  ME: 5.50,
  MD: 6.00,
  MA: 6.25,
  MI: 6.00,
  MN: 7.49,
  MS: 7.07,
  MO: 8.29,
  MT: 0.00,
  NE: 6.94,
  NV: 8.23,
  NH: 0.00,
  NJ: 6.63,
  NM: 7.83,
  NY: 8.52,
  NC: 6.98,
  ND: 6.96,
  OH: 7.24,
  OK: 8.98,
  OR: 0.00,
  PA: 6.34,
  RI: 7.00,
  SC: 7.44,
  SD: 6.40,
  TN: 9.55,
  TX: 8.20,
  UT: 7.19,
  VT: 6.36,
  VA: 5.75,
  WA: 9.29,
  WV: 6.55,
  WI: 5.43,
  WY: 5.36,
  DC: 6.00,
};

/**
 * Look up the approximate combined sales-tax rate for a US state.
 * @param {string} stateCode - Two-letter abbreviation (e.g. "GA").
 * @returns {number} Tax rate as a percentage (e.g. 7.35), or 0 if unknown.
 */
export function getStateTaxRate(stateCode) {
  if (!stateCode) return 0;
  const key = String(stateCode).trim().toUpperCase();
  return STATE_TAX_RATES[key] ?? 0;
}
