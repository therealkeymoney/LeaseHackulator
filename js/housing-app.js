import {
  calculateMortgage,
  calculateRentVsBuy,
  calculateLeaseToOwn,
  calculateCashPurchase,
  calculateRentalOnly,
  calculateARM,
  calculateRefinance,
  calculatePropertyTax,
  calculateClosingCosts,
  compareProperties,
  crossDomainComparison,
  sensitivityMatrix,
  affordabilityCeiling,
  costOfWaiting,
  offerStrategy,
  stressTest,
  equityCrossover,
} from './housing-calculations.js';

import { fmt, fmtPct, getNum, showToast, getFieldValue, setFieldValue, debounce } from './utils.js';

import {
  getAssessmentRatio,
  getHomesteadExemption,
  getInsuranceRate,
  getUtilityAverages,
  getCobbCountyData,
  estimateClosingCosts,
  getAssessmentCap,
  GEORGIA_DATA,
} from './housing-data.js';

// ============================================================
//  Global State (exported for cross-domain access)
// ============================================================

let propertyCount = 0;
const properties = new Map(); // id -> { card, data, results }
let activeWeightPreset = 'equal';

const WEIGHT_PRESETS = {
  equal:    { monthly: 15, totalCost: 15, cashUpfront: 15, dti: 15, interestRate: 10, ltv: 10, taxEfficiency: 10, closingCostRatio: 10 },
  cost:     { monthly: 10, totalCost: 35, cashUpfront: 10, dti: 10, interestRate: 15, ltv: 5,  taxEfficiency: 10, closingCostRatio: 5 },
  payment:  { monthly: 35, totalCost: 10, cashUpfront: 15, dti: 20, interestRate: 10, ltv: 5,  taxEfficiency: 3,  closingCostRatio: 2 },
  balanced: { monthly: 25, totalCost: 20, cashUpfront: 15, dti: 15, interestRate: 10, ltv: 5,  taxEfficiency: 5,  closingCostRatio: 5 },
};

// Export state for cross-domain comparison
export function getHousingResults() {
  const results = [];
  for (const [id, prop] of properties) {
    if (prop.results) results.push(prop.results);
  }
  return results;
}

export function getHousingProperties() { return properties; }

export { crossDomainComparison };

// ============================================================
//  Initialization
// ============================================================

export function initHousing() {
  addPropertyCard();
  wireGlobalActions();
}

// ============================================================
//  Global Action Bar
// ============================================================

function wireGlobalActions() {
  document.getElementById('addPropertyBtn')?.addEventListener('click', addPropertyCard);
  document.getElementById('hCalculateAllBtn')?.addEventListener('click', calculateAll);
  document.getElementById('hCompareBtn')?.addEventListener('click', toggleComparison);
  document.getElementById('hMatrixBtn')?.addEventListener('click', toggleMatrix);
  document.getElementById('hAnalysisBtn')?.addEventListener('click', toggleAnalysis);
  document.getElementById('hPrintBtn')?.addEventListener('click', () => window.print());
  document.getElementById('hThemeToggleBtn')?.addEventListener('click', toggleTheme);
  document.getElementById('hExportCSVBtn')?.addEventListener('click', exportCSV);

  // Weight preset buttons (scoped to housing controls)
  document.querySelectorAll('#hWeightControls .weight-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#hWeightControls .weight-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeWeightPreset = btn.dataset.preset;
      runComparison();
    });
  });

  // Analysis tab nav
  document.querySelectorAll('.analysis-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.analysis-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.analysis-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.panel + 'Panel')?.classList.add('active');
    });
  });
}

// ============================================================
//  Add Property Card
// ============================================================

function addPropertyCard() {
  propertyCount++;
  const id = propertyCount;
  const template = document.getElementById('propertyCardTemplate');
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector('.property-card');

  card.dataset.propertyId = id;
  card.querySelector('.p-num').textContent = id;

  // Wire card events
  wireCardEvents(card, id);

  document.getElementById('propertiesContainer').appendChild(card);
  properties.set(id, { card, data: {}, results: null });
}

// ============================================================
//  Wire Card Events
// ============================================================

function wireCardEvents(card, id) {
  // Tab switching
  card.querySelectorAll('.vehicle-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      card.querySelectorAll('.vehicle-tab-btn').forEach(b => b.classList.remove('active'));
      card.querySelectorAll('.vehicle-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      card.querySelector(`.vehicle-tab-content[data-tab="${btn.dataset.tab}"]`).classList.add('active');
    });
  });

  // Card controls
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      switch (action) {
        case 'remove':
          card.remove();
          properties.delete(id);
          break;
        case 'clear':
          card.querySelectorAll('input:not([readonly])').forEach(i => i.value = '');
          card.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
          break;
        case 'duplicate':
          duplicateCard(card);
          break;
        case 'calculate':
          calculateProperty(card, id);
          break;
        case 'apply-scenario':
          applyScenario(card, id);
          break;
        case 'lookup-property':
          handlePropertyLookup(card, id);
          break;
        case 'decode-vin':
          break; // Housing doesn't use VIN
      }
    });
  });

  // Enter key in the smart lookup input triggers the lookup
  const lookupInput = card.querySelector('.listingLookupInput');
  if (lookupInput) {
    lookupInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handlePropertyLookup(card, id); }
    });
  }

  // Deal type toggle: show/hide conditional sections
  const dealTypeSelect = card.querySelector('.dealType');
  dealTypeSelect.addEventListener('change', () => {
    toggleConditionalSections(card, dealTypeSelect.value);
  });

  // Loan type toggle: show FHA/VA specific fields
  const loanTypeSelect = card.querySelector('.loanType');
  loanTypeSelect.addEventListener('change', () => {
    toggleLoanTypeFields(card, loanTypeSelect.value);
    updateBadge(card, 'loan-type-badge', loanTypeSelect.value.toUpperCase());
  });

  // State change: auto-fill assessment ratio, insurance, utilities
  const stateSelect = card.querySelector('.propState');
  stateSelect.addEventListener('change', () => {
    autoFillStateDefaults(card, stateSelect.value);
  });

  // Down payment sync: % <-> $
  const downPct = card.querySelector('.downPaymentPct');
  const downAmt = card.querySelector('.downPaymentAmt');
  const purchasePrice = card.querySelector('.purchasePrice');

  downPct.addEventListener('input', debounce(() => {
    const price = getNum(purchasePrice.value);
    if (price > 0) {
      downAmt.value = fmt(price * getNum(downPct.value) / 100);
    }
  }));

  downAmt.addEventListener('input', debounce(() => {
    const price = getNum(purchasePrice.value);
    if (price > 0) {
      downPct.value = ((getNum(downAmt.value) / price) * 100).toFixed(1);
    }
  }));

  // Purchase price change: update down $, assessed value, discount
  purchasePrice.addEventListener('input', debounce(() => {
    const price = getNum(purchasePrice.value);
    const list = getNum(card.querySelector('.listPrice').value);
    if (price > 0) {
      downAmt.value = fmt(price * getNum(downPct.value) / 100);
      // Assessed value
      const ratio = getNum(card.querySelector('.assessmentRatio').value) || 40;
      setFieldValue(card, '.assessedValue', fmt(price * ratio / 100));
      setFieldValue(card, '.marketValue', purchasePrice.value);
    }
    if (list > 0 && price > 0) {
      const disc = ((list - price) / list * 100).toFixed(1);
      setFieldValue(card, '.discountFromList', `${disc}% (${fmt(list - price)})`);
    }
  }));

  // Mill rate auto-sum
  const millInputs = ['.countyMillRate', '.schoolMillRate', '.municipalMillRate', '.specialDistrictRate'];
  millInputs.forEach(sel => {
    card.querySelector(sel).addEventListener('input', debounce(() => {
      const total = millInputs.reduce((sum, s) => sum + getNum(card.querySelector(s).value), 0);
      setFieldValue(card, '.totalMillRate', total.toFixed(3));
      // Auto-calc tax
      const assessed = getNum(card.querySelector('.assessedValue').value.replace(/[$,]/g, ''));
      const exemptions = getNum(card.querySelector('.homesteadExemption').value) +
        getNum(card.querySelector('.seniorExemption').value) +
        getNum(card.querySelector('.veteranExemption').value) +
        getNum(card.querySelector('.disabilityExemption').value) +
        getNum(card.querySelector('.otherExemptions').value);
      const taxable = Math.max(0, assessed - exemptions);
      const annualTax = taxable * total / 1000 + getNum(card.querySelector('.specialAssessments').value);
      setFieldValue(card, '.annualPropertyTax', fmt(annualTax));
      setFieldValue(card, '.monthlyPropertyTax', fmt(annualTax / 12));
    }));
  });

  // Utility auto-sum
  const utilInputs = ['.monthlyElectric', '.monthlyGasUtility', '.monthlyWater', '.monthlySewer', '.monthlyTrash', '.monthlyInternet', '.otherMonthlyUtilities'];
  utilInputs.forEach(sel => {
    const el = card.querySelector(sel);
    if (el) {
      el.addEventListener('input', debounce(() => {
        const total = utilInputs.reduce((sum, s) => {
          const e = card.querySelector(s);
          return sum + (e ? getNum(e.value) : 0);
        }, 0);
        setFieldValue(card, '.totalMonthlyUtilities', fmt(total));
      }));
    }
  });

  // Credit tier badge
  card.querySelector('.creditTier').addEventListener('change', (e) => {
    const labels = { tier1: 'Tier 1', tier2: 'Tier 2', tier3: 'Tier 3', tier4: 'Tier 4', tier5: 'Tier 5' };
    updateBadge(card, 'credit-tier-badge', labels[e.target.value] || '');
  });

  // Initial state
  toggleConditionalSections(card, 'mortgage');
  autoFillStateDefaults(card, 'GA');
}

// ============================================================
//  Conditional Section Toggles
// ============================================================

function toggleConditionalSections(card, dealType) {
  const sections = {
    'arm-fields': dealType === 'arm',
    'lto-fields': dealType === 'leasetoown',
    'rvb-fields': dealType === 'rentvsbuy',
    'refi-fields': dealType === 'refinance',
    'cash-fields': dealType === 'cash',
    'rental-fields': dealType === 'rentalonly',
  };
  for (const [cls, show] of Object.entries(sections)) {
    const el = card.querySelector(`.${cls}`);
    if (el) el.classList.toggle('hidden', !show);
  }
}

function toggleLoanTypeFields(card, loanType) {
  card.querySelector('.fha-mip-row')?.classList.toggle('hidden', loanType !== 'fha');
  card.querySelector('.va-funding-row')?.classList.toggle('hidden', loanType !== 'va');
}

// ============================================================
//  Auto-Fill State Defaults
// ============================================================

function autoFillStateDefaults(card, stateCode) {
  if (!stateCode) return;

  // Assessment ratio
  const ratio = getAssessmentRatio(stateCode);
  setFieldValue(card, '.assessmentRatio', ratio);

  // Insurance
  const insurance = getInsuranceRate(stateCode);
  setFieldValue(card, '.annualInsurance', insurance);

  // Utilities
  const utils = getUtilityAverages(stateCode);
  if (utils) {
    setFieldValue(card, '.monthlyElectric', utils.electric);
    setFieldValue(card, '.monthlyGasUtility', utils.gas);
    setFieldValue(card, '.monthlyWater', utils.water);
    setFieldValue(card, '.monthlySewer', utils.sewer);
    setFieldValue(card, '.monthlyTrash', utils.trash);
    setFieldValue(card, '.monthlyInternet', utils.internet);
    const totalUtil = Object.values(utils).reduce((a, b) => a + b, 0);
    setFieldValue(card, '.totalMonthlyUtilities', fmt(totalUtil));
  }

  // Homestead exemption
  const exemption = getHomesteadExemption(stateCode);
  if (exemption) {
    setFieldValue(card, '.homesteadExemption', exemption.base);
  }

  // Assessment cap
  const cap = getAssessmentCap(stateCode);
  if (cap) {
    setFieldValue(card, '.assessmentCapPct', cap.capPct);
  }

  // Georgia-specific: Cobb County mill rates
  if (stateCode === 'GA') {
    const cobb = getCobbCountyData();
    setFieldValue(card, '.countyMillRate', cobb.countyMillRate);
    setFieldValue(card, '.schoolMillRate', cobb.schoolMillRate);
    setFieldValue(card, '.municipalMillRate', 0);
    setFieldValue(card, '.specialDistrictRate', cobb.fireDistrict);
    setFieldValue(card, '.totalMillRate', cobb.typicalTotal.toFixed(3));
  }

  // Recalculate assessed value
  const price = getNum(card.querySelector('.purchasePrice')?.value);
  if (price > 0) {
    setFieldValue(card, '.assessedValue', fmt(price * ratio / 100));
  }
}

// ============================================================
//  Badge Helpers
// ============================================================

function updateBadge(card, className, text) {
  const badge = card.querySelector(`.${className}`);
  if (!badge) return;
  if (text) {
    badge.textContent = text;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ============================================================
//  Property Listing Auto-Population (RentCast)
//  Housing analog of the vehicle VIN-decode flow. Type/paste a
//  listing URL, address, or MLS# and auto-fill the whole card.
//
//  DATA SOURCE: RentCast (https://app.rentcast.io/app/api). Real-estate
//  listing data is NOT free/public like VIN data, so this needs a key.
//  Two ways to wire it (proxy strongly recommended):
//    1) Deploy propertyproxyworker.js to a free Cloudflare Worker, then set
//         window.PROPERTY_PROXY_URL = "https://property.YOURNAME.workers.dev";
//       (keeps your key server-side; unlocks URL + MLS# lookup).
//    2) Or set window.RENTCAST_API_KEY = "..." for a direct address lookup
//       (browser CORS usually blocks this — proxy is the supported path).
//  Set either from the DevTools console at runtime, or hardcode the
//  _DEFAULT constants just below.
// ============================================================

const PROPERTY_PROXY_URL_DEFAULT = '';   // e.g. 'https://property.you.workers.dev'
const RENTCAST_API_KEY_DEFAULT   = '';   // e.g. 'rc_xxx' (direct address lookup only)

function _propProxyUrl() {
  return ((typeof window !== 'undefined' && window.PROPERTY_PROXY_URL) || PROPERTY_PROXY_URL_DEFAULT || '').replace(/\/+$/, '');
}
function _rentcastKey() {
  return (typeof window !== 'undefined' && window.RENTCAST_API_KEY) || RENTCAST_API_KEY_DEFAULT || '';
}

// Parse a pasted listing URL (Zillow/Redfin/Realtor/Trulia/Homes.com/…) into
// a best-effort free-form address string RentCast can geocode.
function parseListingUrl(raw) {
  if (!raw) return null;
  let u;
  try { u = new URL(raw.trim()); } catch (_) { return null; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const segs = u.pathname.split('/').filter(Boolean);
  const deslug = (s) => decodeURIComponent(s || '')
    .replace(/[_+]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

  // Zillow: /homedetails/1234-Main-St-City-ST-12345/12345_zpid/
  if (host.indexOf('zillow.') >= 0) {
    const i = segs.indexOf('homedetails');
    if (i >= 0 && segs[i + 1]) return { address: deslug(segs[i + 1]) };
  }
  // Redfin: /{ST}/{City}/{Street-Zip}/home/{id}
  if (host.indexOf('redfin.') >= 0) {
    if (segs.length >= 3 && /^[A-Z]{2}$/i.test(segs[0])) {
      return { address: `${deslug(segs[2])} ${deslug(segs[1])} ${segs[0].toUpperCase()}`.trim() };
    }
  }
  // Realtor: /realestateandhomes-detail/1234-Main-St_City_ST_12345_M...-...
  if (host.indexOf('realtor.') >= 0) {
    const i = segs.indexOf('realestateandhomes-detail');
    const slug = i >= 0 ? segs[i + 1] : segs[segs.length - 1];
    if (slug) return { address: deslug(slug.replace(/_M\d+[-\d]*$/i, '')) };
  }
  // Trulia: /p/{st}/{city}/{slug--id} or /home/{slug}
  if (host.indexOf('trulia.') >= 0) {
    const slug = segs[segs.length - 1] || '';
    return { address: deslug(slug.replace(/--\d+$/, '')) };
  }
  // Homes.com / generic: pick the most address-like segment (has a number)
  const cand = segs.slice().reverse().find((s) => /\d/.test(s) && s.length > 4);
  if (cand) return { address: deslug(cand) };
  return null;
}

// --- Client-side RentCast normalization (used only for the direct-key
// fallback; the proxy already returns this shape). Mirrors buildPayload()
// in propertyproxyworker.js. ---
function _mapPropertyTypeClient(t) {
  const s = String(t || '').toLowerCase();
  if (s.indexOf('single') >= 0) return 'single_family';
  if (s.indexOf('condo') >= 0 || s.indexOf('town') >= 0) return 'condo';
  if (s.indexOf('multi') >= 0 || s.indexOf('apartment') >= 0 || s.indexOf('duplex') >= 0) return 'multi_family';
  if (s.indexOf('manufactured') >= 0 || s.indexOf('mobile') >= 0) return 'manufactured';
  return 'single_family';
}
function _num(v) {
  if (v == null) return null;
  const x = parseFloat(String(v).replace(/[$,]/g, ''));
  return isNaN(x) ? null : x;
}
function _taxHistoryClient(propertyTaxes) {
  const out = [];
  if (propertyTaxes && typeof propertyTaxes === 'object') {
    for (const k of Object.keys(propertyTaxes)) {
      const row = propertyTaxes[k] || {};
      const year = row.year || parseInt(k, 10) || null;
      const total = row.total != null ? row.total : (row.amount != null ? row.amount : null);
      if (year && total != null) out.push({ year, amount: total });
    }
  }
  out.sort((a, b) => b.year - a.year);
  return out;
}
function _priceHistoryClient() {
  const merged = {};
  for (let i = 0; i < arguments.length; i++) {
    const hist = arguments[i];
    if (!hist || typeof hist !== 'object') continue;
    for (const dateKey of Object.keys(hist)) {
      const ev = hist[dateKey] || {};
      const date = ev.date || dateKey;
      const price = ev.price != null ? ev.price : null;
      if (price == null) continue;
      const idk = date + '|' + price;
      if (!merged[idk]) merged[idk] = { date, price, event: ev.event || ev.listingType || 'Price' };
    }
  }
  return Object.keys(merged).map((k) => merged[k])
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function normalizeRentcast(listing, record, avm) {
  listing = listing || {}; record = record || {}; avm = avm || null;
  const agent = listing.listingAgent || {};
  const office = listing.listingOffice || {};
  const taxHistory = _taxHistoryClient(record.propertyTaxes);
  const priceHistory = _priceHistoryClient(listing.history, record.history);
  const property = {
    formattedAddress: listing.formattedAddress || record.formattedAddress || null,
    addressLine1: listing.addressLine1 || record.addressLine1 || null,
    city: listing.city || record.city || null,
    state: listing.state || record.state || null,
    zipCode: listing.zipCode || record.zipCode || null,
    county: record.county || listing.county || null,
    propertyType: _mapPropertyTypeClient(listing.propertyType || record.propertyType),
    bedrooms: listing.bedrooms != null ? listing.bedrooms : record.bedrooms,
    bathrooms: listing.bathrooms != null ? listing.bathrooms : record.bathrooms,
    squareFootage: listing.squareFootage != null ? listing.squareFootage : record.squareFootage,
    lotSize: listing.lotSize != null ? listing.lotSize : record.lotSize,
    yearBuilt: listing.yearBuilt != null ? listing.yearBuilt : record.yearBuilt,
    listPrice: _num(listing.price),
    status: listing.status || null,
    daysOnMarket: listing.daysOnMarket != null ? listing.daysOnMarket : null,
    mlsNumber: listing.mlsNumber || null,
    mlsName: listing.mlsName || null,
    listingAgent: agent.name || null,
    listingAgentPhone: agent.phone || null,
    brokerage: office.name || agent.website || null,
    lastSalePrice: _num(record.lastSalePrice),
    hoaFee: record.hoa && record.hoa.fee != null ? _num(record.hoa.fee) : null,
    annualPropertyTax: taxHistory.length ? taxHistory[0].amount : null,
    avmValue: avm && avm.price != null ? _num(avm.price) : null,
  };
  return { property, priceHistory, taxHistory };
}

// Fetch normalized property data. kind = 'property' | 'mls'. Tries the proxy
// first, then a direct RentCast key (address-only). Returns
// { ok, property, priceHistory, taxHistory, ... } or throws.
async function fetchPropertyData(kind, paramsObj) {
  const qs = new URLSearchParams(paramsObj).toString();
  const proxy = _propProxyUrl();
  if (proxy) {
    const r = await fetch(proxy + '/' + kind + '?' + qs);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error((d && d.error) || ('proxy HTTP ' + r.status));
    return d;
  }
  // Direct RentCast fallback — address-based property lookup only.
  const key = _rentcastKey();
  if (!key) {
    throw new Error('No property data source configured. Deploy propertyproxyworker.js and set window.PROPERTY_PROXY_URL, or set window.RENTCAST_API_KEY.');
  }
  if (kind !== 'property' || !paramsObj.address) {
    throw new Error('Direct RentCast key supports address lookup only. Deploy the proxy worker for URL/MLS# lookup.');
  }
  const h = { 'X-Api-Key': key, Accept: 'application/json' };
  const enc = encodeURIComponent(paramsObj.address);
  const grab = (path) => fetch('https://api.rentcast.io/v1' + path, { headers: h })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [listing, record] = await Promise.all([
    grab('/listings/sale?address=' + enc),
    grab('/properties?address=' + enc),
  ]);
  const l = Array.isArray(listing) ? listing[0] : listing;
  const rec = Array.isArray(record) ? record[0] : record;
  if (!l && !rec) throw new Error('No RentCast data for that address (or the browser blocked the request via CORS — use the proxy).');
  return { ok: true, source: 'rentcast-direct', ...normalizeRentcast(l, rec, null) };
}

// Populate all card fields from a normalized property object.
function applyPropertyData(card, p) {
  if (!card || !p) return [];
  const filled = [];
  const set = (sel, val, label) => {
    if (val == null || val === '' || (typeof val === 'number' && isNaN(val))) return;
    setFieldValue(card, sel, val);
    if (label) filled.push(label);
  };

  // Address block — set state FIRST (fires state defaults) so the RentCast
  // tax value we set later isn't clobbered by mill-rate recalcs.
  const streetOnly = p.addressLine1 ||
    (p.formattedAddress ? String(p.formattedAddress).split(',')[0] : null);
  if (p.state) {
    const stateSel = card.querySelector('.propState');
    if (stateSel) {
      stateSel.value = p.state;
      stateSel.dispatchEvent(new Event('change', { bubbles: true }));
      filled.push('State');
    }
  }
  set('.propertyAddress', streetOnly, 'Address');
  set('.propCity', p.city, 'City');
  set('.propZip', p.zipCode, 'ZIP');
  set('.propCounty', p.county, 'County');

  if (p.propertyType) {
    const sel = card.querySelector('.propertyType');
    if (sel) { sel.value = p.propertyType; filled.push('Type'); }
  }
  set('.yearBuilt', p.yearBuilt, 'Year Built');
  set('.bedrooms', p.bedrooms, 'Beds');
  set('.bathrooms', p.bathrooms, 'Baths');
  set('.sqft', p.squareFootage, 'Sq Ft');
  if (p.lotSize != null && !isNaN(p.lotSize)) {
    // RentCast lot size is in square feet → the card wants acres.
    const acres = p.lotSize > 50 ? (p.lotSize / 43560) : p.lotSize;
    set('.lotSize', Math.round(acres * 1000) / 1000, 'Lot');
  }

  // Listing / agent
  set('.mlsNumber', p.mlsNumber, 'MLS#');
  set('.daysOnMarket', p.daysOnMarket, 'DOM');
  set('.listingAgent', p.listingAgent, 'Agent');
  set('.agentPhone', p.listingAgentPhone, 'Agent Phone');
  set('.brokerage', p.brokerage, 'Brokerage');
  set('.listingSource', p.mlsName || 'RentCast', 'Source');

  // Pricing — list price, purchase price (default to list), appraised (AVM)
  if (p.listPrice != null && p.listPrice > 0) {
    set('.listPrice', fmt(p.listPrice), 'List Price');
    const purchaseEl = card.querySelector('.purchasePrice');
    if (purchaseEl && getNum(purchaseEl.value) <= 0) {
      purchaseEl.value = fmt(p.listPrice);
      purchaseEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (p.avmValue != null && p.avmValue > 0) set('.appraisedValue', fmt(p.avmValue), 'AVM');

  // Listing URL (persist the pasted one if the field is empty)
  const lookupRaw = (card.querySelector('.listingLookupInput') || {}).value || '';
  if (/^https?:\/\//i.test(lookupRaw)) {
    const urlEl = card.querySelector('.listingUrl');
    if (urlEl && !urlEl.value) urlEl.value = lookupRaw.trim();
  }

  // HOA (RentCast hoa.fee is a monthly figure)
  if (p.hoaFee != null && p.hoaFee > 0) set('.monthlyHOA', fmt(p.hoaFee), 'HOA');

  // Property tax — set LAST so it wins over any state-default recalc.
  if (p.annualPropertyTax != null && p.annualPropertyTax > 0) {
    setFieldValue(card, '.annualPropertyTax', fmt(p.annualPropertyTax));
    setFieldValue(card, '.monthlyPropertyTax', fmt(p.annualPropertyTax / 12));
    filled.push('Property Tax');
  }

  return filled;
}

// Render price history + tax history under the Pricing section.
function renderPropertyHistory(card, priceHistory, taxHistory) {
  const out = card.querySelector('.property-history-output');
  if (!out) return;
  const ph = (priceHistory || []).slice(0, 8);
  const th = (taxHistory || []).slice(0, 6);
  if (!ph.length && !th.length) { out.innerHTML = ''; return; }

  let html = '';
  if (ph.length) {
    html += '<div style="margin-top:8px;"><strong style="color:var(--primary);font-size:0.78rem;">📉 Price History</strong>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:0.72rem;">' +
      '<thead><tr style="text-align:left;color:#64748b;"><th style="padding:2px 6px;">Date</th><th style="padding:2px 6px;">Event</th><th style="padding:2px 6px;text-align:right;">Price</th></tr></thead><tbody>';
    html += ph.map((h) =>
      '<tr style="border-top:1px solid var(--border,#e5e7eb);"><td style="padding:2px 6px;">' + (h.date || '—') +
      '</td><td style="padding:2px 6px;color:#475569;">' + (h.event || '—') +
      '</td><td style="padding:2px 6px;text-align:right;font-variant-numeric:tabular-nums;">' + (h.price != null ? fmt(h.price) : '—') + '</td></tr>'
    ).join('');
    html += '</tbody></table></div>';
  }
  if (th.length) {
    html += '<div style="margin-top:8px;"><strong style="color:var(--primary);font-size:0.78rem;">🏛️ Property Tax History</strong>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:0.72rem;">' +
      '<thead><tr style="text-align:left;color:#64748b;"><th style="padding:2px 6px;">Year</th><th style="padding:2px 6px;text-align:right;">Annual Tax</th></tr></thead><tbody>';
    html += th.map((t) =>
      '<tr style="border-top:1px solid var(--border,#e5e7eb);"><td style="padding:2px 6px;">' + t.year +
      '</td><td style="padding:2px 6px;text-align:right;font-variant-numeric:tabular-nums;">' + fmt(t.amount) + '</td></tr>'
    ).join('');
    html += '</tbody></table></div>';
  }
  out.innerHTML = html;
}

// Orchestrator — wired to the "🔍 Look up" button + Enter key.
async function handlePropertyLookup(card, id) {
  const loading = card.querySelector('.listing-lookup-row .field-loading');
  const errSpan = card.querySelector('.listing-lookup-row .field-error');
  const setStatus = (msg) => { if (loading) loading.textContent = msg || ''; };
  const setErr = (msg) => { if (errSpan) errSpan.textContent = msg || ''; };
  setErr('');

  // Resolve the input: smart box first, then fall back to existing fields.
  const smart = (card.querySelector('.listingLookupInput') || {}).value || '';
  const state = (card.querySelector('.propState') || {}).value || '';
  const city = (card.querySelector('.propCity') || {}).value || '';
  const zip = (card.querySelector('.propZip') || {}).value || '';

  let kind = 'property';
  let params = null;
  const raw = smart.trim();

  if (/^https?:\/\//i.test(raw) || raw.indexOf('zillow.') >= 0 || raw.indexOf('redfin.') >= 0 || raw.indexOf('realtor.') >= 0) {
    const parsed = parseListingUrl(raw.startsWith('http') ? raw : 'https://' + raw);
    if (!parsed || !parsed.address) { setErr('Could not read an address from that URL — paste the full listing link or type the address.'); showToast('Could not parse listing URL', true); return; }
    params = { address: parsed.address };
  } else if (raw && /^[A-Za-z0-9\- ]{4,}$/.test(raw) && /\d{5,}/.test(raw.replace(/\D/g, '')) && !/\d+\s+\S/.test(raw)) {
    // Looks like a bare MLS number (mostly digits, no "123 Street" pattern)
    kind = 'mls';
    params = { mls: raw.replace(/[^0-9A-Za-z]/g, ''), state, city, zip };
  } else if (raw) {
    params = { address: raw };
  } else {
    // Fall back to existing fields
    const url = (card.querySelector('.listingUrl') || {}).value || '';
    const addr = (card.querySelector('.propertyAddress') || {}).value || '';
    const mls = (card.querySelector('.mlsNumber') || {}).value || '';
    if (url) {
      const parsed = parseListingUrl(url);
      if (parsed && parsed.address) params = { address: parsed.address };
    }
    if (!params && addr) {
      params = { address: [addr, city, state, zip].filter(Boolean).join(', ') };
    }
    if (!params && mls) { kind = 'mls'; params = { mls, state, city, zip }; }
    if (!params) { setErr('Enter a listing URL, address, or MLS# first.'); showToast('Nothing to look up', true); return; }
  }

  if (kind === 'mls' && !state && !zip) {
    setErr('MLS# lookup needs the state (and ideally ZIP) filled in — RentCast has no direct MLS# search.');
    showToast('Fill in state/ZIP for MLS# lookup', true);
    return;
  }

  setStatus('Looking up listing…');
  updateBadge(card, 'listing-badge', '⏳');
  try {
    const d = await fetchPropertyData(kind, params);
    if (!d || d.ok === false || !d.property) throw new Error((d && d.error) || 'No data returned');
    const filled = applyPropertyData(card, d.property);
    renderPropertyHistory(card, d.priceHistory, d.taxHistory);
    setStatus('');
    updateBadge(card, 'listing-badge', d.property.mlsNumber ? ('MLS ' + d.property.mlsNumber) : 'Listing ✓');
    showToast('✓ Populated ' + filled.length + ' fields from listing' + (d.source ? ' (' + d.source + ')' : ''));
  } catch (e) {
    setStatus('');
    updateBadge(card, 'listing-badge', '');
    setErr(String((e && e.message) || e));
    showToast('Lookup failed: ' + String((e && e.message) || e), true);
    console.warn('[property-lookup] failed:', e);
  }
}

// ============================================================
//  Calculate Property
// ============================================================

function calculateProperty(card, id) {
  const dealType = card.querySelector('.dealType').value;
  const gfv = (sel, def) => getFieldValue(card, sel, def);

  // Common params
  const commonParams = {
    purchasePrice:    gfv('.purchasePrice'),
    appraisedValue:   gfv('.appraisedValue') || gfv('.purchasePrice'),
    sellerCredits:    gfv('.sellerCredits'),
    closingCostCredit: gfv('.closingCostCredit'),
    downPaymentPct:   gfv('.downPaymentPct', 20),
    downPaymentAmt:   gfv('.downPaymentAmt'),
    existingHomeEquity: gfv('.existingHomeEquity'),
    interestRate:     gfv('.interestRate', 7),
    loanTermYears:    gfv('.loanTermYears', 30),
    loanType:         card.querySelector('.loanType').value,
    creditTier:       card.querySelector('.creditTier').value,

    // Property tax
    assessedValue:      gfv('.assessedValue') || gfv('.purchasePrice') * gfv('.assessmentRatio', 40) / 100,
    assessmentRatio:    gfv('.assessmentRatio', 40),
    millRate:           gfv('.totalMillRate') || (gfv('.countyMillRate') + gfv('.schoolMillRate') + gfv('.municipalMillRate') + gfv('.specialDistrictRate')),
    homesteadExemption: gfv('.homesteadExemption'),
    otherExemptions:    gfv('.seniorExemption') + gfv('.veteranExemption') + gfv('.disabilityExemption') + gfv('.otherExemptions'),
    specialAssessments: gfv('.specialAssessments'),

    // Insurance
    annualInsurance: gfv('.annualInsurance', 2000),
    floodInsurance:  gfv('.floodInsurance'),
    monthlyHOA:      gfv('.monthlyHOA'),

    // PMI
    pmiEnabled:  card.querySelector('.pmiEnabled').value === 'auto' ? undefined : card.querySelector('.pmiEnabled').value === 'yes',
    pmiRate:     gfv('.pmiRate'),

    // Closing costs
    totalClosingCosts:   gfv('.totalClosingCosts'),
    rollClosingIntoLoan: card.querySelector('.rollClosingIntoLoan').value === 'yes',
    originationFee:      gfv('.originationFee'),
    appraisalFee:        gfv('.appraisalFee', 450),
    inspectionFee:       gfv('.inspectionFee', 400),
    titleInsurance:      gfv('.titleInsurance'),
    recordingFee:        gfv('.recordingFee', 125),
    transferTax:         gfv('.transferTax'),
    applicationFee:      gfv('.applicationFee', 400),
    underwritingFee:     gfv('.underwritingFee', 500),

    // Utilities
    monthlyElectric: gfv('.monthlyElectric'),
    monthlyGas:      gfv('.monthlyGasUtility'),
    monthlyWater:    gfv('.monthlyWater'),
    monthlySewer:    gfv('.monthlySewer'),
    monthlyTrash:    gfv('.monthlyTrash'),
    monthlyInternet: gfv('.monthlyInternet'),
    otherMonthlyUtilities: gfv('.otherMonthlyUtilities'),

    // Qualification
    grossMonthlyIncome: gfv('.grossMonthlyIncome'),
    monthlyDebts:       gfv('.monthlyDebts'),
    filingStatus:       card.querySelector('.filingStatus').value,
    marginalTaxRate:    gfv('.marginalTaxRate', 22),
  };

  // Estimate closing if not manually entered
  if (commonParams.totalClosingCosts <= 0) {
    const loanAmt = commonParams.purchasePrice - commonParams.downPaymentAmt;
    commonParams.totalClosingCosts = estimateClosingCosts(
      commonParams.loanType, commonParams.purchasePrice, loanAmt
    );
  }

  let result;

  switch (dealType) {
    case 'mortgage':
      result = calculateMortgage(commonParams);
      break;

    case 'cash':
      result = calculateCashPurchase({
        ...commonParams,
        annualAppreciation: gfv('.cashAppreciation', 3),
        investmentReturn:   gfv('.cashInvestmentReturn', 7),
        maintenancePct:     gfv('.cashMaintenancePct', 1),
        yearsToAnalyze:     gfv('.cashYearsToAnalyze', 10),
      });
      break;

    case 'rentalonly':
      result = calculateRentalOnly({
        monthlyRent:        gfv('.roMonthlyRent', 1800),
        annualRentIncrease: gfv('.roAnnualRentIncrease', 3),
        rentersInsurance:   gfv('.roRentersInsurance', 25),
        securityDeposit:    gfv('.roSecurityDeposit'),
        monthlyUtilities:   gfv('.roMonthlyUtilities'),
        yearsToAnalyze:     gfv('.roYearsToAnalyze', 3),
      });
      break;

    case 'arm':
      result = calculateARM({
        ...commonParams,
        initialRate:       gfv('.initialRate', 6.5),
        fixedPeriodYears:  gfv('.fixedPeriodYears', 5),
        adjustmentPeriod:  gfv('.adjustmentPeriod', 1),
        initialCap:        gfv('.initialCap', 2),
        periodicCap:       gfv('.periodicCap', 2),
        lifetimeCap:       gfv('.lifetimeCap', 5),
        currentIndex:      gfv('.currentIndex', 4.5),
        margin:            gfv('.margin', 2.75),
        expectedIndexChange: gfv('.expectedIndexChange', 0.25),
      });
      break;

    case 'leasetoown':
      result = calculateLeaseToOwn({
        ...commonParams,
        marketRent:         gfv('.marketRent', 1500),
        rentPremiumPct:     gfv('.rentPremiumPct', 10),
        rentCreditPct:      gfv('.rentCreditPct', 20),
        optionFeePct:       gfv('.optionFeePct', 3),
        optionFeeCreditable: card.querySelector('.optionFeeCreditable').value === 'yes',
        leaseTerm:          gfv('.ltoLeaseTerm', 36),
      });
      break;

    case 'rentvsbuy':
      result = calculateRentVsBuy({
        ...commonParams,
        monthlyRent:        gfv('.monthlyRent', 1500),
        annualRentIncrease: gfv('.annualRentIncrease', 3),
        annualAppreciation: gfv('.annualAppreciation', 3),
        investmentReturn:   gfv('.investmentReturn', 7),
        yearsToCompare:     gfv('.yearsToCompare', 10),
        rentersInsurance:   gfv('.rentersInsurance', 30),
        maintenancePct:     gfv('.maintenancePct', 1),
      });
      break;

    case 'refinance':
      result = calculateRefinance({
        currentBalance:      gfv('.currentBalance'),
        currentRate:         gfv('.currentRate'),
        currentTermRemaining: gfv('.currentTermRemaining', 300),
        newRate:             gfv('.newRate'),
        newTermYears:        gfv('.newTermYears', 30),
        cashOutAmount:       gfv('.cashOutAmount'),
        refiClosingCosts:    gfv('.refiClosingCosts', 3000),
        rollRefiClosingIntoLoan: card.querySelector('.rollRefiClosing')?.value === 'yes',
        pointsPurchased:     gfv('.pointsPurchased'),
        interestRate:        gfv('.newRate'),
      });
      break;
  }

  if (result) {
    // Attach label from address or property number
    const addr = card.querySelector('.propertyAddress')?.value;
    result.label = addr || `Property ${id}`;
    result.sqft = gfv('.sqft');
    properties.get(id).results = result;
    renderResults(card, result);
    // Update readonly fields
    if (result.type === 'mortgage') {
      setFieldValue(card, '.totalClosingCosts', result.formatted.totalClosingCosts);
      setFieldValue(card, '.pmiDropOffMonth', result.pmiDropOffMonth > 0 ? `Month ${result.pmiDropOffMonth}` : 'N/A');
      setFieldValue(card, '.frontEndDTI', fmtPct(result.frontEndRatio));
      setFieldValue(card, '.backEndDTI', fmtPct(result.backEndRatio));
    }
    showToast(`Property ${id} calculated`);
  }
}

// ============================================================
//  Deal Quality Assessment Engine
// ============================================================

function assessDealQuality(result) {
  if (!result) return null;
  const signals = [];

  if (result.type === 'mortgage' || result.type === 'arm') {
    const r = result.type === 'arm' ? result.baseMortgage : result;

    // Interest rate assessment
    if (r.interestRate <= 5) signals.push({ metric: 'Interest Rate', value: r.interestRate + '%', rating: 'excellent', arrow: 'down', note: 'Below average - great rate' });
    else if (r.interestRate <= 6.5) signals.push({ metric: 'Interest Rate', value: r.interestRate + '%', rating: 'good', arrow: 'down', note: 'Competitive rate' });
    else if (r.interestRate <= 7.5) signals.push({ metric: 'Interest Rate', value: r.interestRate + '%', rating: 'fair', arrow: 'flat', note: 'Average market rate' });
    else signals.push({ metric: 'Interest Rate', value: r.interestRate + '%', rating: 'poor', arrow: 'up', note: 'Above average - consider waiting or buying down' });

    // LTV assessment
    if (r.ltvRatio <= 80) signals.push({ metric: 'LTV Ratio', value: fmtPct(r.ltvRatio), rating: 'excellent', arrow: 'down', note: 'No PMI required' });
    else if (r.ltvRatio <= 90) signals.push({ metric: 'LTV Ratio', value: fmtPct(r.ltvRatio), rating: 'fair', arrow: 'up', note: 'PMI required until 80% LTV' });
    else if (r.ltvRatio <= 95) signals.push({ metric: 'LTV Ratio', value: fmtPct(r.ltvRatio), rating: 'poor', arrow: 'up', note: 'High LTV - significant PMI cost' });
    else signals.push({ metric: 'LTV Ratio', value: fmtPct(r.ltvRatio), rating: 'poor', arrow: 'up', note: 'Very high LTV - maximum PMI' });

    // DTI assessment (if income provided)
    if (r.grossMonthlyIncome > 0) {
      if (r.frontEndRatio <= 25) signals.push({ metric: 'Front-End DTI', value: fmtPct(r.frontEndRatio), rating: 'excellent', arrow: 'down', note: 'Very comfortable housing ratio' });
      else if (r.frontEndRatio <= 28) signals.push({ metric: 'Front-End DTI', value: fmtPct(r.frontEndRatio), rating: 'good', arrow: 'down', note: 'Within conventional guidelines' });
      else if (r.frontEndRatio <= 31) signals.push({ metric: 'Front-End DTI', value: fmtPct(r.frontEndRatio), rating: 'fair', arrow: 'flat', note: 'FHA max - stretching budget' });
      else signals.push({ metric: 'Front-End DTI', value: fmtPct(r.frontEndRatio), rating: 'poor', arrow: 'up', note: 'Exceeds guidelines - payment shock risk' });

      if (r.backEndRatio <= 33) signals.push({ metric: 'Back-End DTI', value: fmtPct(r.backEndRatio), rating: 'excellent', arrow: 'down', note: 'Strong overall debt position' });
      else if (r.backEndRatio <= 36) signals.push({ metric: 'Back-End DTI', value: fmtPct(r.backEndRatio), rating: 'good', arrow: 'down', note: 'Within conventional max' });
      else if (r.backEndRatio <= 43) signals.push({ metric: 'Back-End DTI', value: fmtPct(r.backEndRatio), rating: 'fair', arrow: 'flat', note: 'FHA max territory' });
      else signals.push({ metric: 'Back-End DTI', value: fmtPct(r.backEndRatio), rating: 'poor', arrow: 'up', note: 'Over-leveraged - high risk' });
    }

    // Interest-to-principal ratio (first year)
    const firstYearPI = r.amortization?.slice(0, 12) || [];
    if (firstYearPI.length > 0) {
      const yr1Interest = firstYearPI.reduce((s, m) => s + m.interest, 0);
      const yr1Principal = firstYearPI.reduce((s, m) => s + m.principal, 0);
      const ratio = yr1Principal > 0 ? yr1Interest / yr1Principal : 999;
      if (ratio < 1.5) signals.push({ metric: 'Interest/Principal (Yr 1)', value: ratio.toFixed(2) + 'x', rating: 'excellent', arrow: 'down', note: 'More going to equity than interest' });
      else if (ratio < 3) signals.push({ metric: 'Interest/Principal (Yr 1)', value: ratio.toFixed(2) + 'x', rating: 'fair', arrow: 'flat', note: 'Typical for current rates' });
      else signals.push({ metric: 'Interest/Principal (Yr 1)', value: ratio.toFixed(2) + 'x', rating: 'poor', arrow: 'up', note: 'Mostly paying interest early on' });
    }

    // PMI impact
    if (r.pmiEnabled && r.monthlyPMI > 0) {
      const pmiPctOfPayment = (r.monthlyPMI / r.totalMonthly) * 100;
      if (pmiPctOfPayment < 3) signals.push({ metric: 'PMI Impact', value: fmtPct(pmiPctOfPayment) + ' of payment', rating: 'good', arrow: 'down', note: 'Minimal PMI burden' });
      else if (pmiPctOfPayment < 6) signals.push({ metric: 'PMI Impact', value: fmtPct(pmiPctOfPayment) + ' of payment', rating: 'fair', arrow: 'flat', note: 'Moderate PMI cost' });
      else signals.push({ metric: 'PMI Impact', value: fmtPct(pmiPctOfPayment) + ' of payment', rating: 'poor', arrow: 'up', note: 'High PMI - consider larger down payment' });
    }

    // Property tax effective rate
    const effectiveRate = r.purchasePrice > 0 ? (r.annualPropertyTax / r.purchasePrice) * 100 : 0;
    if (effectiveRate <= 0.75) signals.push({ metric: 'Effective Tax Rate', value: fmtPct(effectiveRate), rating: 'excellent', arrow: 'down', note: 'Low property tax area' });
    else if (effectiveRate <= 1.25) signals.push({ metric: 'Effective Tax Rate', value: fmtPct(effectiveRate), rating: 'good', arrow: 'down', note: 'Moderate property tax' });
    else if (effectiveRate <= 2.0) signals.push({ metric: 'Effective Tax Rate', value: fmtPct(effectiveRate), rating: 'fair', arrow: 'flat', note: 'Above-average tax area' });
    else signals.push({ metric: 'Effective Tax Rate', value: fmtPct(effectiveRate), rating: 'poor', arrow: 'up', note: 'High tax area - factor into budget' });

    // Closing cost as % of purchase
    const closingPct = r.purchasePrice > 0 ? (r.totalClosingCosts / r.purchasePrice) * 100 : 0;
    if (closingPct <= 2) signals.push({ metric: 'Closing Cost Ratio', value: fmtPct(closingPct), rating: 'excellent', arrow: 'down', note: 'Below average closing costs' });
    else if (closingPct <= 3.5) signals.push({ metric: 'Closing Cost Ratio', value: fmtPct(closingPct), rating: 'good', arrow: 'down', note: 'Average closing costs' });
    else if (closingPct <= 5) signals.push({ metric: 'Closing Cost Ratio', value: fmtPct(closingPct), rating: 'fair', arrow: 'flat', note: 'Above average - room to negotiate' });
    else signals.push({ metric: 'Closing Cost Ratio', value: fmtPct(closingPct), rating: 'poor', arrow: 'up', note: 'High closing costs - shop around' });

    // Total interest as multiple of loan
    const interestMultiple = r.loanAmount > 0 ? r.totalInterest / r.loanAmount : 0;
    if (interestMultiple < 0.5) signals.push({ metric: 'Total Interest / Loan', value: (interestMultiple * 100).toFixed(0) + '%', rating: 'excellent', arrow: 'down', note: 'Low interest burden' });
    else if (interestMultiple < 1.0) signals.push({ metric: 'Total Interest / Loan', value: (interestMultiple * 100).toFixed(0) + '%', rating: 'fair', arrow: 'flat', note: 'Typical interest burden at current rates' });
    else signals.push({ metric: 'Total Interest / Loan', value: (interestMultiple * 100).toFixed(0) + '%', rating: 'poor', arrow: 'up', note: 'You\'ll pay more in interest than the loan itself' });
  }

  if (result.type === 'refinance') {
    if (result.monthlySavings > 200) signals.push({ metric: 'Monthly Savings', value: fmt(result.monthlySavings), rating: 'excellent', arrow: 'down', note: 'Strong monthly savings' });
    else if (result.monthlySavings > 50) signals.push({ metric: 'Monthly Savings', value: fmt(result.monthlySavings), rating: 'good', arrow: 'down', note: 'Meaningful savings' });
    else if (result.monthlySavings > 0) signals.push({ metric: 'Monthly Savings', value: fmt(result.monthlySavings), rating: 'fair', arrow: 'flat', note: 'Marginal savings - consider breakeven' });
    else signals.push({ metric: 'Monthly Savings', value: fmt(result.monthlySavings), rating: 'poor', arrow: 'up', note: 'Payment would increase' });

    if (result.breakevenMonths > 0 && result.breakevenMonths <= 24) signals.push({ metric: 'Breakeven', value: result.breakevenMonths + ' months', rating: 'excellent', arrow: 'down', note: 'Quick payback on refi costs' });
    else if (result.breakevenMonths <= 48) signals.push({ metric: 'Breakeven', value: result.breakevenMonths + ' months', rating: 'good', arrow: 'down', note: 'Reasonable breakeven period' });
    else if (result.breakevenMonths <= 72) signals.push({ metric: 'Breakeven', value: result.breakevenMonths + ' months', rating: 'fair', arrow: 'flat', note: 'Long breakeven - only if staying long-term' });
    else signals.push({ metric: 'Breakeven', value: result.breakevenMonths > 0 ? result.breakevenMonths + ' months' : 'Never', rating: 'poor', arrow: 'up', note: 'May not be worth refinancing' });
  }

  if (result.type === 'leasetoown') {
    const creditPct = result.purchasePrice > 0 ? (result.totalCreditsAccumulated / result.purchasePrice) * 100 : 0;
    if (creditPct >= 10) signals.push({ metric: 'Credits Accumulated', value: fmtPct(creditPct) + ' of price', rating: 'excellent', arrow: 'down', note: 'Strong equity build during lease' });
    else if (creditPct >= 5) signals.push({ metric: 'Credits Accumulated', value: fmtPct(creditPct) + ' of price', rating: 'good', arrow: 'down', note: 'Decent equity accumulation' });
    else signals.push({ metric: 'Credits Accumulated', value: fmtPct(creditPct) + ' of price', rating: 'fair', arrow: 'flat', note: 'Low credit accumulation - negotiate better terms' });

    const wastedPct = result.totalRentPaid > 0 ? (result.wastedRent / result.totalRentPaid) * 100 : 0;
    if (wastedPct < 60) signals.push({ metric: 'Wasted Rent', value: fmtPct(wastedPct), rating: 'good', arrow: 'down', note: 'Good portion going to credits' });
    else if (wastedPct < 80) signals.push({ metric: 'Wasted Rent', value: fmtPct(wastedPct), rating: 'fair', arrow: 'flat', note: 'Most rent is not credited' });
    else signals.push({ metric: 'Wasted Rent', value: fmtPct(wastedPct), rating: 'poor', arrow: 'up', note: 'Very little rent credited - bad deal' });

    signals.push({ metric: 'Forfeiture Risk', value: fmt(result.forfeitedIfWalkAway), rating: result.forfeitedIfWalkAway > 20000 ? 'poor' : 'fair', arrow: 'up', note: 'Amount lost if you walk away' });
  }

  // Overall grade
  const scores = { excellent: 4, good: 3, fair: 2, poor: 1 };
  const avg = signals.length > 0 ? signals.reduce((s, sig) => s + scores[sig.rating], 0) / signals.length : 0;
  let grade, gradeClass;
  if (avg >= 3.5) { grade = 'A'; gradeClass = 'grade-a'; }
  else if (avg >= 2.8) { grade = 'B'; gradeClass = 'grade-b'; }
  else if (avg >= 2.0) { grade = 'C'; gradeClass = 'grade-c'; }
  else if (avg >= 1.5) { grade = 'D'; gradeClass = 'grade-d'; }
  else { grade = 'F'; gradeClass = 'grade-f'; }

  return { signals, grade, gradeClass, avgScore: avg };
}

function renderDealAssessment(assessment) {
  if (!assessment || assessment.signals.length === 0) return '';

  const arrowMap = { up: '▲', down: '▼', flat: '▸' };
  const colorMap = { excellent: 'indicator-excellent', good: 'indicator-good', fair: 'indicator-fair', poor: 'indicator-poor' };

  return `
    <div class="result-section deal-assessment">
      <h4>Deal Quality Assessment</h4>
      <div class="deal-grade ${assessment.gradeClass}">
        <span class="grade-letter">${assessment.grade}</span>
        <span class="grade-label">Overall Grade</span>
      </div>
      <div class="signal-list">
        ${assessment.signals.map(s => `
          <div class="signal-row ${colorMap[s.rating]}">
            <span class="signal-arrow">${arrowMap[s.arrow]}</span>
            <span class="signal-metric">${s.metric}</span>
            <span class="signal-value">${s.value}</span>
            <span class="signal-note">${s.note}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderCostAnatomy(result) {
  if (result.type !== 'mortgage' && result.type !== 'arm') return '';
  const r = result.type === 'arm' ? result.baseMortgage : result;
  const total = r.totalMonthly;
  if (total <= 0) return '';

  const segments = [
    { label: 'P&I', value: r.monthlyPI, color: 'var(--primary)' },
    { label: 'Tax', value: r.monthlyPropertyTax, color: 'var(--secondary)' },
    { label: 'Insurance', value: r.monthlyInsurance, color: 'var(--gold)' },
  ];
  if (r.monthlyPMI > 0) segments.push({ label: 'PMI', value: r.monthlyPMI, color: 'var(--danger)' });
  if (r.monthlyHOA > 0) segments.push({ label: 'HOA', value: r.monthlyHOA, color: 'var(--accent)' });

  return `
    <div class="result-section">
      <h4>Payment Anatomy</h4>
      <div class="anatomy-bar">
        ${segments.map(s => {
          const pct = (s.value / total * 100).toFixed(1);
          return `<div class="anatomy-segment" style="width:${pct}%;background:${s.color};" title="${s.label}: ${pct}%"></div>`;
        }).join('')}
      </div>
      <div class="anatomy-legend">
        ${segments.map(s => {
          const pct = (s.value / total * 100).toFixed(1);
          return `<span><span class="legend-dot" style="background:${s.color}"></span> ${s.label} ${pct}% (${fmt(s.value)})</span>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ============================================================
//  Render Results
// ============================================================

function renderResults(card, result) {
  const container = card.querySelector('.results-output');
  let html = '';

  if (result.type === 'mortgage') {
    html = renderMortgageResults(result);
  } else if (result.type === 'arm') {
    html = renderARMResults(result);
  } else if (result.type === 'cash') {
    html = renderCashResults(result);
  } else if (result.type === 'rental') {
    html = renderRentalResults(result);
  } else if (result.type === 'leasetoown') {
    html = renderLeaseToOwnResults(result);
  } else if (result.type === 'rentvsbuy') {
    html = renderRentVsBuyResults(result);
  } else if (result.type === 'refinance') {
    html = renderRefinanceResults(result);
  }

  container.innerHTML = html;

  // Switch to results tab
  card.querySelectorAll('.vehicle-tab-btn').forEach(b => b.classList.remove('active'));
  card.querySelectorAll('.vehicle-tab-content').forEach(c => c.classList.remove('active'));
  card.querySelector('.vehicle-tab-btn[data-tab="results"]').classList.add('active');
  card.querySelector('.vehicle-tab-content[data-tab="results"]').classList.add('active');
}

function renderMortgageResults(r) {
  const f = r.formatted;
  return `
    <div class="results-grid">
      <div class="result-section">
        <h4>Monthly Payment Breakdown</h4>
        <div class="result-row"><span>Principal & Interest</span><span class="result-val">${f.monthlyPI}</span></div>
        <div class="result-row"><span>Property Tax</span><span class="result-val">${f.monthlyPropertyTax}</span></div>
        <div class="result-row"><span>Insurance</span><span class="result-val">${f.monthlyInsurance}</span></div>
        ${r.monthlyPMI > 0 ? `<div class="result-row"><span>PMI</span><span class="result-val">${f.monthlyPMI}</span></div>` : ''}
        ${r.monthlyHOA > 0 ? `<div class="result-row"><span>HOA</span><span class="result-val">${fmt(r.monthlyHOA)}</span></div>` : ''}
        <div class="result-row result-total"><span>Total PITI (+PMI/HOA)</span><span class="result-val">${f.totalMonthly}</span></div>
        ${r.totalMonthlyUtilities > 0 ? `<div class="result-row"><span>Utilities</span><span class="result-val">${f.totalMonthlyUtilities}</span></div>` : ''}
        <div class="result-row result-highlight"><span>Total Monthly Housing</span><span class="result-val">${f.totalMonthlyHousingCost}</span></div>
      </div>

      <div class="result-section">
        <h4>Loan Details</h4>
        <div class="result-row"><span>Purchase Price</span><span class="result-val">${f.purchasePrice}</span></div>
        <div class="result-row"><span>Down Payment</span><span class="result-val">${f.downPaymentAmt} (${f.downPaymentPct})</span></div>
        <div class="result-row"><span>Loan Amount</span><span class="result-val">${f.loanAmount}</span></div>
        <div class="result-row"><span>LTV Ratio</span><span class="result-val">${f.ltvRatio}</span></div>
        <div class="result-row"><span>Interest Rate</span><span class="result-val">${f.interestRate}</span></div>
        <div class="result-row"><span>Term</span><span class="result-val">${r.loanTermYears} years</span></div>
      </div>

      <div class="result-section">
        <h4>Property Tax Detail</h4>
        <div class="result-row"><span>Assessed Value</span><span class="result-val">${fmt(r.assessedValue)}</span></div>
        <div class="result-row"><span>Assessment Ratio</span><span class="result-val">${r.assessmentRatio}%</span></div>
        <div class="result-row"><span>Taxable Value</span><span class="result-val">${fmt(r.taxableAssessed)}</span></div>
        <div class="result-row"><span>Mill Rate</span><span class="result-val">${r.millRate.toFixed(3)} mills</span></div>
        <div class="result-row"><span>Annual Tax</span><span class="result-val">${f.annualPropertyTax}</span></div>
      </div>

      <div class="result-section">
        <h4>Cash at Closing</h4>
        <div class="result-row"><span>Down Payment</span><span class="result-val">${f.downPaymentAmt}</span></div>
        <div class="result-row"><span>Closing Costs</span><span class="result-val">${f.totalClosingCosts}</span></div>
        ${r.sellerCredits > 0 ? `<div class="result-row"><span>Seller Credits</span><span class="result-val">-${f.sellerCredits}</span></div>` : ''}
        <div class="result-row result-total"><span>Total Cash Needed</span><span class="result-val">${f.cashAtClosing}</span></div>
      </div>

      <div class="result-section">
        <h4>Lifetime Totals</h4>
        <div class="result-row"><span>Total Payments (P&I)</span><span class="result-val">${f.totalPayments}</span></div>
        <div class="result-row"><span>Total Interest</span><span class="result-val">${f.totalInterest}</span></div>
        ${r.totalPMIPaid > 0 ? `<div class="result-row"><span>Total PMI Paid</span><span class="result-val">${f.totalPMIPaid}</span></div>` : ''}
        <div class="result-row result-highlight"><span>Total Cost of Ownership</span><span class="result-val">${f.totalCostOfOwnership}</span></div>
      </div>

      ${r.grossMonthlyIncome > 0 ? `
      <div class="result-section">
        <h4>Qualification</h4>
        <div class="result-row"><span>Front-End DTI</span><span class="result-val ${r.frontEndRatio > 28 ? 'text-danger' : 'text-success'}">${f.frontEndRatio}</span></div>
        <div class="result-row"><span>Back-End DTI</span><span class="result-val ${r.backEndRatio > 36 ? 'text-danger' : 'text-success'}">${f.backEndRatio}</span></div>
        <div class="result-row"><span>Status</span><span class="result-val ${r.qualifies ? 'text-success' : 'text-danger'}">${r.qualifies ? 'Likely Qualifies' : 'May Not Qualify'}</span></div>
        ${r.qualificationNotes.map(n => `<div class="result-note">${n}</div>`).join('')}
      </div>` : ''}

      <div class="result-section">
        <h4>Tax Benefits (Est. Year 1)</h4>
        <div class="result-row"><span>Mortgage Interest Deduction</span><span class="result-val">${fmt(r.firstYearInterest)}</span></div>
        <div class="result-row"><span>SALT Deduction (capped $10K)</span><span class="result-val">${fmt(r.saltDeduction)}</span></div>
        <div class="result-row"><span>Est. Annual Tax Savings</span><span class="result-val">${f.estimatedTaxSavings}</span></div>
      </div>

      ${renderCostAnatomy(r)}
      ${renderDealAssessment(assessDealQuality(r))}
      ${renderAmortizationTable(r.amortization, r.yearlySnapshots)}
    </div>
  `;
}

function renderCashResults(r) {
  const f = r.formatted;
  return `
    <div class="results-grid">
      <div class="result-section">
        <h4>Cash to Purchase</h4>
        <div class="result-row"><span>Purchase Price</span><span class="result-val">${f.purchasePrice}</span></div>
        <div class="result-row"><span>Cash Closing Costs</span><span class="result-val">${f.cashClosingCosts}</span></div>
        <div class="result-row result-total"><span>Total Cash Needed</span><span class="result-val">${f.totalCashToPurchase}</span></div>
      </div>

      <div class="result-section">
        <h4>Monthly Ownership Cost (no mortgage)</h4>
        <div class="result-row"><span>Property Tax</span><span class="result-val">${f.monthlyPropertyTax}</span></div>
        <div class="result-row"><span>Insurance</span><span class="result-val">${f.monthlyInsurance}</span></div>
        ${r.monthlyHOA > 0 ? `<div class="result-row"><span>HOA</span><span class="result-val">${f.monthlyHOA}</span></div>` : ''}
        <div class="result-row"><span>Maintenance</span><span class="result-val">${f.monthlyMaintenance}</span></div>
        ${r.monthlyUtilities > 0 ? `<div class="result-row"><span>Utilities</span><span class="result-val">${f.monthlyUtilities}</span></div>` : ''}
        <div class="result-row result-highlight"><span>Total Monthly</span><span class="result-val">${f.monthlyOwnershipCost}</span></div>
      </div>

      <div class="result-section">
        <h4>Property Tax Detail</h4>
        <div class="result-row"><span>Assessed Value</span><span class="result-val">${fmt(r.assessedValue)}</span></div>
        <div class="result-row"><span>Annual Property Tax</span><span class="result-val">${f.annualPropertyTax}</span></div>
        <div class="result-row"><span>Annual Insurance</span><span class="result-val">${f.annualInsurance}</span></div>
      </div>

      <div class="result-section">
        <h4>${r.years}-Year Outlook</h4>
        <div class="result-row"><span>Home Value at End (${r.appreciation}%/yr)</span><span class="result-val">${f.homeValueAtEnd}</span></div>
        <div class="result-row"><span>Equity Gain (appreciation)</span><span class="result-val">${f.equityGain}</span></div>
        <div class="result-row"><span>Ongoing Costs (${r.years}yr)</span><span class="result-val">${f.totalOngoing}</span></div>
        <div class="result-row"><span>Opportunity Cost of Capital</span><span class="result-val">${f.opportunityCost}</span></div>
        <div class="result-row result-highlight"><span>Net Cost After Equity</span><span class="result-val">${f.netCostAfterEquity}</span></div>
      </div>
    </div>
  `;
}

function renderRentalResults(r) {
  const f = r.formatted;
  const rows = r.rentByYear.map(y =>
    `<div class="result-row"><span>Year ${y.year}</span><span class="result-val">${fmt(y.monthlyRent)}/mo · ${fmt(y.annualRent)}/yr</span></div>`
  ).join('');
  return `
    <div class="results-grid">
      <div class="result-section">
        <h4>Monthly Rental Cost</h4>
        <div class="result-row"><span>Rent</span><span class="result-val">${f.monthlyRent}</span></div>
        <div class="result-row"><span>Renter's Insurance</span><span class="result-val">${f.rentersInsurance}</span></div>
        ${r.monthlyUtilities > 0 ? `<div class="result-row"><span>Utilities</span><span class="result-val">${f.monthlyUtilities}</span></div>` : ''}
        <div class="result-row result-highlight"><span>Total Monthly</span><span class="result-val">${f.monthlyTotal}</span></div>
      </div>

      <div class="result-section">
        <h4>${r.years}-Year Totals</h4>
        <div class="result-row"><span>Total Rent</span><span class="result-val">${f.totalRent}</span></div>
        <div class="result-row"><span>Total Renter's Insurance</span><span class="result-val">${f.totalRentersIns}</span></div>
        ${r.totalUtilities > 0 ? `<div class="result-row"><span>Total Utilities</span><span class="result-val">${f.totalUtilities}</span></div>` : ''}
        <div class="result-row"><span>Security Deposit (refundable)</span><span class="result-val">${f.securityDeposit}</span></div>
        <div class="result-row result-total"><span>Total Cost of Renting</span><span class="result-val">${f.totalCost}</span></div>
        <div class="result-row"><span>Avg Monthly (over ${r.years}yr)</span><span class="result-val">${f.avgMonthly}</span></div>
        <div class="result-row result-highlight"><span>Equity Built</span><span class="result-val">$0</span></div>
      </div>

      <div class="result-section">
        <h4>Rent by Year (${r.annualRentIncrease}%/yr increase)</h4>
        ${rows}
      </div>
    </div>
  `;
}

function renderARMResults(r) {
  const f = r.formatted;
  const bm = r.baseMortgage;
  return `
    <div class="results-grid">
      <div class="result-section">
        <h4>ARM ${r.fixedPeriodYears}/1 Summary</h4>
        <div class="result-row"><span>Initial Rate</span><span class="result-val">${f.initialRate}</span></div>
        <div class="result-row"><span>Initial Payment (P&I)</span><span class="result-val">${f.initialPayment}</span></div>
        <div class="result-row"><span>Fixed Period</span><span class="result-val">${r.fixedPeriodYears} years</span></div>
        <div class="result-row"><span>Max Rate</span><span class="result-val">${f.maxPossibleRate}</span></div>
        <div class="result-row"><span>Worst-Case Payment</span><span class="result-val text-danger">${f.worstCasePayment}</span></div>
        <div class="result-row"><span>Best-Case Payment</span><span class="result-val text-success">${f.bestCasePayment}</span></div>
      </div>

      <div class="result-section">
        <h4>vs. Fixed Rate Comparison</h4>
        <div class="result-row"><span>Fixed Rate Payment</span><span class="result-val">${r.fixedMortgage.formatted.monthlyPI}</span></div>
        <div class="result-row"><span>ARM Initial Payment</span><span class="result-val">${f.initialPayment}</span></div>
        <div class="result-row"><span>Total ARM Interest</span><span class="result-val">${f.totalInterest}</span></div>
        <div class="result-row"><span>Total Fixed Interest</span><span class="result-val">${r.fixedMortgage.formatted.totalInterest}</span></div>
        <div class="result-row result-highlight"><span>ARM Savings (est.)</span><span class="result-val">${f.armSavings}</span></div>
      </div>

      <div class="result-section">
        <h4>Rate Caps</h4>
        <div class="result-row"><span>Initial Cap</span><span class="result-val">${r.initialCap}%</span></div>
        <div class="result-row"><span>Periodic Cap</span><span class="result-val">${r.periodicCap}%</span></div>
        <div class="result-row"><span>Lifetime Cap</span><span class="result-val">${r.lifetimeCap}%</span></div>
        <div class="result-row"><span>Index + Margin</span><span class="result-val">${r.currentIndex}% + ${r.margin}%</span></div>
      </div>

      ${renderCostAnatomy(r)}
      ${renderDealAssessment(assessDealQuality(r))}
    </div>
  `;
}

function renderLeaseToOwnResults(r) {
  const f = r.formatted;
  return `
    <div class="results-grid">
      <div class="result-section">
        <h4>Lease Phase (${r.leaseTerm} months)</h4>
        <div class="result-row"><span>Market Rent</span><span class="result-val">${f.marketRent}</span></div>
        <div class="result-row"><span>Rent Premium</span><span class="result-val">${f.rentPremium}</span></div>
        <div class="result-row result-total"><span>Total Monthly Rent</span><span class="result-val">${f.totalMonthlyRent}</span></div>
        <div class="result-row"><span>Monthly Rent Credit</span><span class="result-val text-success">${f.monthlyRentCredit}</span></div>
        <div class="result-row"><span>Option Fee (upfront)</span><span class="result-val">${f.optionFee}</span></div>
        <div class="result-row"><span>Total Rent Credits</span><span class="result-val text-success">${f.totalRentCredits}</span></div>
        <div class="result-row"><span>Total Credits Accumulated</span><span class="result-val text-success">${f.totalCreditsAccumulated}</span></div>
        <div class="result-row"><span>"Wasted" Rent</span><span class="result-val text-danger">${f.wastedRent}</span></div>
      </div>

      <div class="result-section">
        <h4>Conversion to Mortgage</h4>
        <div class="result-row"><span>Purchase Price (locked)</span><span class="result-val">${f.purchasePrice}</span></div>
        <div class="result-row"><span>Home Value at Conversion</span><span class="result-val">${f.homeValueAtConversion}</span></div>
        <div class="result-row"><span>Instant Equity (appreciation)</span><span class="result-val text-success">${f.instantEquity}</span></div>
        <div class="result-row"><span>Effective Down Payment</span><span class="result-val">${f.effectiveDownPayment} (${f.effectiveDownPct})</span></div>
        <div class="result-row"><span>Mortgage Principal</span><span class="result-val">${f.mortgagePrincipal}</span></div>
      </div>

      <div class="result-section">
        <h4>Post-Conversion Monthly (PITI)</h4>
        <div class="result-row"><span>P&I</span><span class="result-val">${r.postConversionMortgage.formatted.monthlyPI}</span></div>
        <div class="result-row"><span>Property Tax</span><span class="result-val">${r.postConversionMortgage.formatted.monthlyPropertyTax}</span></div>
        <div class="result-row"><span>Insurance</span><span class="result-val">${r.postConversionMortgage.formatted.monthlyInsurance}</span></div>
        <div class="result-row result-total"><span>Total Monthly</span><span class="result-val">${r.postConversionMortgage.formatted.totalMonthly}</span></div>
      </div>

      <div class="result-section">
        <h4>Risk Analysis</h4>
        <div class="result-row"><span>Total at Risk if Walk Away</span><span class="result-val text-danger">${f.forfeitedIfWalkAway}</span></div>
        <div class="result-row"><span>Total Cost (full term)</span><span class="result-val">${f.totalCostFullTerm}</span></div>
      </div>

      ${renderDealAssessment(assessDealQuality(r))}
    </div>
  `;
}

function renderRentVsBuyResults(r) {
  const f = r.formatted;
  return `
    <div class="results-grid">
      <div class="result-section">
        <h4>Rent Side (${r.yearsToCompare} years)</h4>
        <div class="result-row"><span>Starting Rent</span><span class="result-val">${f.monthlyRent}/mo</span></div>
        <div class="result-row"><span>Annual Increase</span><span class="result-val">${r.annualRentIncrease}%</span></div>
        <div class="result-row"><span>Total Rent Paid</span><span class="result-val">${f.totalRentPaid}</span></div>
        <div class="result-row"><span>Down Payment Invested</span><span class="result-val text-success">${f.downPaymentInvested}</span></div>
        <div class="result-row"><span>Investment Gain</span><span class="result-val text-success">${f.investmentGain}</span></div>
        <div class="result-row result-total"><span>Net Cost of Renting</span><span class="result-val">${f.netRentCost}</span></div>
      </div>

      <div class="result-section">
        <h4>Buy Side (${r.yearsToCompare} years)</h4>
        <div class="result-row"><span>Monthly PITI</span><span class="result-val">${r.mortgage.formatted.totalMonthly}</span></div>
        <div class="result-row"><span>Cash at Closing</span><span class="result-val">${r.mortgage.formatted.cashAtClosing}</span></div>
        <div class="result-row"><span>Total Outlay</span><span class="result-val">${f.totalBuyCashOutlay}</span></div>
        <div class="result-row"><span>Home Value at End</span><span class="result-val text-success">${f.homeValueAtEnd}</span></div>
        <div class="result-row"><span>Equity at End</span><span class="result-val text-success">${f.equityAtEnd}</span></div>
        <div class="result-row"><span>Tax Savings</span><span class="result-val text-success">${f.totalTaxSavings}</span></div>
        <div class="result-row result-total"><span>Net Cost of Buying</span><span class="result-val">${f.netBuyCost}</span></div>
      </div>

      <div class="result-section result-highlight-section">
        <h4>Verdict</h4>
        <div class="result-row result-highlight">
          <span>${r.buyIsBetter ? '🏠 Buying Wins' : '🏘️ Renting Wins'}</span>
          <span class="result-val">${f.savings} saved</span>
        </div>
        <div class="result-row"><span>Breakeven</span><span class="result-val">${f.breakevenYear}</span></div>
      </div>
    </div>
  `;
}

function renderRefinanceResults(r) {
  const f = r.formatted;
  return `
    <div class="results-grid">
      <div class="result-section">
        <h4>Current Loan</h4>
        <div class="result-row"><span>Balance</span><span class="result-val">${f.currentBalance}</span></div>
        <div class="result-row"><span>Rate</span><span class="result-val">${f.currentRate}</span></div>
        <div class="result-row"><span>Current Payment</span><span class="result-val">${f.effectiveCurrentPayment}</span></div>
        <div class="result-row"><span>Months Remaining</span><span class="result-val">${r.currentTermRemaining}</span></div>
      </div>

      <div class="result-section">
        <h4>New Loan</h4>
        <div class="result-row"><span>New Amount</span><span class="result-val">${f.newLoanAmount}</span></div>
        <div class="result-row"><span>New Rate</span><span class="result-val">${f.newRate}</span></div>
        <div class="result-row"><span>New Payment</span><span class="result-val">${f.newMonthlyPI}</span></div>
        <div class="result-row"><span>New Term</span><span class="result-val">${r.newTermYears} years</span></div>
      </div>

      <div class="result-section result-highlight-section">
        <h4>Savings</h4>
        <div class="result-row"><span>Monthly Savings</span><span class="result-val text-success">${f.monthlySavings}</span></div>
        <div class="result-row"><span>Breakeven</span><span class="result-val">${f.breakevenMonths}</span></div>
        <div class="result-row"><span>Interest Savings</span><span class="result-val text-success">${f.interestSavings}</span></div>
        <div class="result-row"><span>Total Refi Cost</span><span class="result-val">${f.totalRefiCost}</span></div>
        <div class="result-row result-highlight"><span>Net Lifetime Savings</span><span class="result-val">${f.totalSavings}</span></div>
      </div>

      ${renderDealAssessment(assessDealQuality(r))}
    </div>
  `;
}

function renderAmortizationTable(amortization, yearlySnapshots) {
  if (!yearlySnapshots || yearlySnapshots.length === 0) return '';
  return `
    <div class="result-section">
      <h4>Equity Build-Up (Yearly)</h4>
      <table class="amort-table">
        <thead><tr><th>Year</th><th>Balance</th><th>Equity</th><th>Total Interest</th><th>Total PMI</th></tr></thead>
        <tbody>
          ${yearlySnapshots.slice(0, 30).map(y => `
            <tr>
              <td>${y.year}</td>
              <td>${fmt(y.balance)}</td>
              <td>${fmt(y.equity)}</td>
              <td>${fmt(y.totalInterest)}</td>
              <td>${y.totalPMI > 0 ? fmt(y.totalPMI) : '--'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================================
//  Duplicate Card
// ============================================================

function duplicateCard(sourceCard) {
  addPropertyCard();
  const newId = propertyCount;
  const newCard = properties.get(newId).card;

  // Copy all input values
  sourceCard.querySelectorAll('input, select').forEach(input => {
    const cls = input.className;
    const target = newCard.querySelector(`.${cls}`);
    if (target && !input.readOnly) {
      target.value = input.value;
    }
  });
}

// ============================================================
//  Calculate All
// ============================================================

function calculateAll() {
  for (const [id, prop] of properties) {
    calculateProperty(prop.card, id);
  }
  showToast('All properties calculated');
}

// ============================================================
//  Comparison Engine (Full Render)
// ============================================================

function toggleComparison() {
  const section = document.getElementById('hComparisonSection');
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) {
    runComparison();
  }
}

function runComparison() {
  const results = [];
  const labels = [];
  let idx = 1;
  for (const [id, prop] of properties) {
    if (prop.results) {
      const addr = prop.card.querySelector('.propertyAddress')?.value;
      prop.results.label = addr || `Property ${idx}`;
      results.push(prop.results);
    }
    idx++;
  }
  if (results.length < 2) {
    showToast('Need at least 2 calculated properties to compare', true);
    return;
  }

  const weights = WEIGHT_PRESETS[activeWeightPreset] || WEIGHT_PRESETS.balanced;
  const comparison = compareProperties(results, weights);

  renderOverallWinner(comparison);
  renderComparisonTable(comparison);
  renderGoldenRules(comparison);
  renderDarkHorse(comparison);
  renderPairwise(comparison);
  renderCrossDomain(comparison);
}

// ── Overall Winner Banner ──
function renderOverallWinner(comp) {
  const el = document.getElementById('overallWinnerOutput');
  if (!comp.overallBest) { el.innerHTML = ''; return; }
  const d = comp.overallBest;
  el.innerHTML = `
    <div class="winner-banner">
      <div class="winner-trophy">🏆</div>
      <div class="winner-info">
        <h3>${d.label}</h3>
        <p>Score: <strong>${d.score.toFixed(1)}/100</strong> | Monthly: <strong>${fmt(d.monthly)}</strong> | Total: <strong>${fmt(d.totalCost)}</strong></p>
        <div class="winner-badges">${d.badges.map(b => `<span class="badge">${b}</span>`).join('')}</div>
      </div>
    </div>
  `;
}

// ── Ranked Comparison Table ──
function renderComparisonTable(comp) {
  const tbody = document.querySelector('#hComparisonTable tbody');
  tbody.innerHTML = comp.deals.map(d => `
    <tr class="${d.rank === 1 ? 'row-winner' : ''}">
      <td><strong>${d.rank}</strong></td>
      <td>
        ${d.label}
        <span class="deal-type-tag">${d.type}</span>
      </td>
      <td>${fmt(d.monthly)}</td>
      <td>${fmt(d.totalCost)}</td>
      <td>${fmt(d.cashUpfront)}</td>
      <td>${d.interestRate > 0 ? d.interestRate.toFixed(2) + '%' : '--'}</td>
      <td>${d.frontDTI > 0 ? d.frontDTI.toFixed(1) + '%' : '--'}</td>
      <td><span class="score-pill ${d.score >= 70 ? 'score-good' : d.score >= 50 ? 'score-fair' : 'score-poor'}">${d.score.toFixed(1)}</span></td>
      <td>${d.badges.length > 0 ? d.badges.map(b => `<span class="badge badge-sm">${b}</span>`).join(' ') : '--'}</td>
    </tr>
  `).join('');
}

// ── Golden Rule Checks Panel ──
function renderGoldenRules(comp) {
  const el = document.getElementById('goldenRuleOutput');
  if (!comp.goldenRules || comp.goldenRules.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="golden-rule-panel">
      <h3>📏 Golden Rule Check</h3>
      <div class="golden-rules-grid">
        ${comp.goldenRules.map(gr => `
          <div class="golden-rule-card ${gr.allPass ? 'rule-pass' : 'rule-warn'}">
            <div class="rule-header">
              <span class="rule-icon">${gr.allPass ? '✅' : '⚠️'}</span>
              <strong>${gr.rule}</strong>
            </div>
            <div class="rule-details">
              ${gr.deals.map(d => `
                <div class="rule-deal-row ${d.pass ? 'pass' : 'fail'}">
                  <span class="rule-deal-indicator">${d.pass ? '▼' : '▲'}</span>
                  <span class="rule-deal-label">${d.label}</span>
                  <span class="rule-deal-detail">${d.detail}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── Dark Horse Panel ──
function renderDarkHorse(comp) {
  const el = document.getElementById('darkHorseOutput');
  if (!comp.darkHorse) { el.innerHTML = ''; return; }
  const dh = comp.darkHorse;

  el.innerHTML = `
    <div class="dark-horse-panel">
      <div class="dark-horse-header">
        <span class="dark-horse-icon">🐴</span>
        <div>
          <h3>Dark Horse: ${dh.deal.label}</h3>
          <p class="dark-horse-subtitle">Diamond in the Rough — Ranked #${dh.deal.rank} but has hidden strengths</p>
        </div>
        <span class="dark-horse-score">${dh.deal.score.toFixed(1)}</span>
      </div>
      <div class="dark-horse-flags">
        ${dh.flags.map(f => `
          <div class="dark-horse-flag">
            <span class="flag-gem">💎</span>
            <span>${f}</span>
          </div>
        `).join('')}
      </div>
      <div class="dark-horse-comparison">
        <span>vs. Winner (${comp.overallBest.label}):</span>
        <span>Monthly ${dh.deal.monthly > comp.overallBest.monthly ? '▲' : '▼'} ${fmt(Math.abs(dh.deal.monthly - comp.overallBest.monthly))}</span>
        <span>Total ${dh.deal.totalCost > comp.overallBest.totalCost ? '▲' : '▼'} ${fmt(Math.abs(dh.deal.totalCost - comp.overallBest.totalCost))}</span>
      </div>
    </div>
  `;
}

// ── Pairwise Breakdown ──
function renderPairwise(comp) {
  const el = document.getElementById('hPairwiseOutput');
  if (!comp.pairwise || comp.pairwise.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="pairwise-panel">
      <h3>🔄 Head-to-Head Breakdown</h3>
      <div class="pairwise-grid">
        ${comp.pairwise.map(p => `
          <div class="pairwise-card">
            <div class="pairwise-header">
              <span>${p.a}</span>
              <span class="pairwise-vs">vs</span>
              <span>${p.b}</span>
            </div>
            <div class="pairwise-winner">Winner: <strong>${p.winner}</strong> (+${p.scoreDiff} pts)</div>
            <div class="pairwise-metrics">
              <div class="pw-row"><span>Monthly</span><span class="pw-favor">${p.monthlyFavor} saves ${fmt(p.monthlySavings)}/mo</span></div>
              <div class="pw-row"><span>Total Cost</span><span class="pw-favor">${p.totalFavor} saves ${fmt(p.totalSavings)}</span></div>
              <div class="pw-row"><span>Cash Needed</span><span class="pw-favor">${p.cashFavor} saves ${fmt(p.cashSavings)}</span></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── Cross-Domain (Housing x Vehicle) Pairings ──
function renderCrossDomain(comp) {
  const el = document.getElementById('crossDomainOutput');

  // Check if vehicle data exists (from merged calculator or localStorage)
  let vehicleResults = [];
  try {
    const stored = localStorage.getItem('hackulator_vehicle_results');
    if (stored) vehicleResults = JSON.parse(stored);
  } catch (e) { /* no vehicle data */ }

  if (vehicleResults.length === 0) {
    el.innerHTML = `
      <div class="cross-domain-panel">
        <h3>🏠🚗 Housing + Vehicle Pairings</h3>
        <p class="cross-domain-placeholder">
          No vehicle data available yet. When the housing and vehicle calculators merge,
          this section will show the optimal pairing of each property with each vehicle —
          best house/best car/best financial plan for your total budget picture.
        </p>
        <div class="cross-domain-preview">
          <div class="pairing-preview-row">
            <span class="preview-tag">Best Overall Pairing</span>
            <span class="preview-desc">Lowest combined DTI across all house + vehicle combos</span>
          </div>
          <div class="pairing-preview-row">
            <span class="preview-tag">Best House</span>
            <span class="preview-desc">Highest-scoring property independent of vehicle choice</span>
          </div>
          <div class="pairing-preview-row">
            <span class="preview-tag">Best Vehicle</span>
            <span class="preview-desc">Highest-scoring vehicle independent of housing choice</span>
          </div>
          <div class="pairing-preview-row">
            <span class="preview-tag">Best Financial Plan</span>
            <span class="preview-desc">Combo that maximizes savings + equity while staying under DTI limits</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // If vehicle data exists, run full cross-domain
  const housingResults = comp.deals.map(d => d.result);
  const grossIncome = comp.deals.find(d => d.grossIncome > 0)?.grossIncome || 0;
  const cross = crossDomainComparison(housingResults, vehicleResults, grossIncome);

  el.innerHTML = `
    <div class="cross-domain-panel">
      <h3>🏠🚗 Housing + Vehicle Pairings</h3>
      ${cross.bestPairing ? `
        <div class="best-pairing-banner">
          <span class="pairing-trophy">🏆</span>
          <div>
            <strong>Best Pairing: ${cross.bestPairing.housingLabel} + ${cross.bestPairing.vehicleLabel}</strong>
            <p>Combined: ${fmt(cross.bestPairing.combinedMonthly)}/mo | DTI: ${cross.bestPairing.combinedDTI.toFixed(1)}% | Grade: ${cross.bestPairing.healthGrade}</p>
          </div>
        </div>
      ` : ''}
      <table class="comp-table">
        <thead><tr><th>House</th><th>Vehicle</th><th>House $/mo</th><th>Vehicle $/mo</th><th>Combined</th><th>DTI</th><th>Grade</th></tr></thead>
        <tbody>
          ${cross.pairings.slice(0, 20).map(p => `
            <tr class="${p.isBestPairing ? 'row-winner' : ''}">
              <td>${p.housingLabel}</td>
              <td>${p.vehicleLabel}</td>
              <td>${fmt(p.housingMonthly)}</td>
              <td>${fmt(p.vehicleMonthly)}</td>
              <td><strong>${fmt(p.combinedMonthly)}</strong></td>
              <td>${p.combinedDTI > 0 ? p.combinedDTI.toFixed(1) + '%' : '--'}</td>
              <td><span class="score-pill ${p.healthGrade === 'A' ? 'score-good' : p.healthGrade === 'B' ? 'score-fair' : 'score-poor'}">${p.healthGrade}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${cross.pairings.some(p => p.warnings.length > 0) ? `
        <div class="pairing-warnings">
          ${cross.pairings.filter(p => p.warnings.length > 0 && p.isBestPairing).flatMap(p =>
            p.warnings.map(w => `<div class="pairing-warning">⚠️ ${w}</div>`)
          ).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================================
//  Matrix (Payment Sensitivity Grid)
// ============================================================

function toggleMatrix() {
  const section = document.getElementById('hMatrixSection');
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) {
    populateMatrixDropdown();
    runMatrix();
  }
}

function populateMatrixDropdown() {
  const sel = document.getElementById('matrixTargetProperty');
  sel.innerHTML = '';
  let idx = 1;
  for (const [id, prop] of properties) {
    if (prop.results) {
      const addr = prop.card.querySelector('.propertyAddress')?.value || `Property ${idx}`;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = addr;
      sel.appendChild(opt);
    }
    idx++;
  }
  sel.addEventListener('change', runMatrix);
}

function runMatrix() {
  const sel = document.getElementById('matrixTargetProperty');
  const id = parseInt(sel.value);
  const prop = properties.get(id);
  if (!prop?.results) {
    document.getElementById('hMatrixOutput').innerHTML = '<p style="color:var(--text-muted);">Select a calculated property.</p>';
    return;
  }

  const r = prop.results;
  const params = {
    purchasePrice: r.purchasePrice || 0,
    interestRate: r.interestRate || 7,
    downPaymentPct: r.downPaymentPct || 20,
    loanTermYears: r.loanTermYears || 30,
  };
  const matrix = sensitivityMatrix(params);

  let html = `<div class="matrix-grid-wrap">
    <table class="matrix-table">
      <thead>
        <tr>
          <th class="matrix-corner">Price \\ Rate</th>
          ${matrix.rateSteps.map(r => `<th>${r.toFixed(2)}%</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

  matrix.grid.forEach(row => {
    html += `<tr><td class="matrix-price">${fmt(row.price)} <span class="matrix-pct">${row.pricePct >= 0 ? '+' : ''}${row.pricePct}%</span></td>`;
    row.cells.forEach(cell => {
      const delta = cell.payment - matrix.basePayment;
      const cls = cell.isBase ? 'matrix-base' : delta < 0 ? 'matrix-good' : delta > 200 ? 'matrix-bad' : 'matrix-neutral';
      html += `<td class="${cls}">${cell.formatted}<br><span class="matrix-delta">${delta >= 0 ? '+' : ''}${fmt(delta)}</span></td>`;
    });
    html += '</tr>';
  });

  html += `</tbody></table></div>
    <p class="matrix-note">Base: ${fmt(matrix.basePrice)} @ ${matrix.baseRate}% = <strong>${fmt(matrix.basePayment)}</strong> P&I | Deltas shown from base</p>`;

  document.getElementById('hMatrixOutput').innerHTML = html;
}

// ============================================================
//  Analysis Panel (6 tools)
// ============================================================

function toggleAnalysis() {
  const section = document.getElementById('analysisSection');
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) {
    runAllAnalysis();
  }
}

function getFirstResult() {
  for (const [id, prop] of properties) {
    if (prop.results) return { id, prop, card: prop.card, result: prop.results };
  }
  return null;
}

function runAllAnalysis() {
  const first = getFirstResult();
  if (!first) {
    showToast('Calculate at least one property first', true);
    return;
  }
  renderAffordability(first);
  renderCostOfWaiting(first);
  renderOfferStrategy(first);
  renderStressTest(first);
  renderEquityCrossover(first);
  renderBudgetWaterfall(first);
}

// ── Affordability Ceiling ──
function renderAffordability(ctx) {
  const r = ctx.result;
  const ceil = affordabilityCeiling({
    grossMonthlyIncome: r.grossMonthlyIncome || 0,
    monthlyDebts: r.monthlyDebts || 0,
    interestRate: r.interestRate || 7,
    loanTermYears: r.loanTermYears || 30,
    downPaymentPct: r.downPaymentPct || 20,
    effectiveTaxRate: r.purchasePrice > 0 ? (r.annualPropertyTax / r.purchasePrice) * 100 : 0.47,
    annualInsurancePct: r.purchasePrice > 0 ? (r.annualInsurance / r.purchasePrice) * 100 : 0.59,
    monthlyHOA: r.monthlyHOA || 0,
  });

  if (!ceil) {
    document.getElementById('affordabilityPanel').innerHTML = '<p class="analysis-empty">Enter gross monthly income to calculate affordability ceiling.</p>';
    return;
  }

  const currentPrice = r.purchasePrice || 0;

  document.getElementById('affordabilityPanel').innerHTML = `
    <div class="analysis-card">
      <h3>💵 Affordability Ceiling</h3>
      <p class="analysis-subtitle">Maximum purchase price at each DTI threshold (${ceil.interestRate}% rate, ${ceil.downPct}% down)</p>
      <div class="afford-grid">
        ${ceil.thresholds.map(t => {
          const overUnder = currentPrice > 0 ? currentPrice - t.maxPrice : 0;
          const withinBudget = overUnder <= 0;
          return `
            <div class="afford-card ${withinBudget ? 'afford-ok' : 'afford-over'}">
              <div class="afford-header">
                <span class="afford-label">${t.threshold}</span>
                <span class="afford-dti">${t.frontMax}% / ${t.backMax}%</span>
              </div>
              <div class="afford-price">${t.formatted.maxPrice}</div>
              <div class="afford-details">
                <span>Max Payment: ${t.formatted.maxHousing}/mo</span>
                <span>Down: ${t.formatted.downPayment}</span>
              </div>
              ${currentPrice > 0 ? `
                <div class="afford-vs ${withinBudget ? 'text-success' : 'text-danger'}">
                  ${withinBudget ? '✅' : '⚠️'} Current target ${withinBudget ? 'is' : 'exceeds this by'} ${withinBudget ? 'within budget' : fmt(overUnder)}
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ── Cost of Waiting ──
function renderCostOfWaiting(ctx) {
  const r = ctx.result;
  const card = ctx.card;
  const currentRent = getFieldValue(card, '.monthlyRent') || getFieldValue(card, '.marketRent') || 1500;

  const cow = costOfWaiting({
    purchasePrice: r.purchasePrice || 0,
    interestRate: r.interestRate || 7,
    downPaymentPct: r.downPaymentPct || 20,
    loanTermYears: r.loanTermYears || 30,
    annualAppreciation: 3,
    annualRateChange: 0.25,
    currentRent: currentRent,
  });

  document.getElementById('waitingPanel').innerHTML = `
    <div class="analysis-card">
      <h3>⏳ Cost of Waiting</h3>
      <p class="analysis-subtitle">What happens if you delay? (3% appreciation, +0.25%/yr rate trend, ${fmt(currentRent)}/mo rent)</p>
      <p class="analysis-baseline">Current: ${cow.formatted.nowPayment} P&I @ ${cow.nowRate}% on ${fmt(cow.nowPrice)}</p>
      <table class="comp-table">
        <thead>
          <tr><th>Delay</th><th>New Price</th><th>New Rate</th><th>New P&I</th><th>Payment ▲</th><th>Extra Interest</th><th>Rent Paid</th><th>Total Cost</th></tr>
        </thead>
        <tbody>
          ${cow.scenarios.map(s => `
            <tr>
              <td><strong>${s.label}</strong></td>
              <td>${s.formatted.futurePrice}</td>
              <td>${s.formatted.futureRate}</td>
              <td>${s.formatted.futurePayment}</td>
              <td class="text-danger">${s.formatted.paymentIncrease}/mo</td>
              <td class="text-danger">${s.formatted.interestIncrease}</td>
              <td>${s.formatted.rentPaid}</td>
              <td class="text-danger"><strong>${s.formatted.totalCost}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Offer Strategy ──
function renderOfferStrategy(ctx) {
  const r = ctx.result;
  const card = ctx.card;

  const strategy = offerStrategy({
    listPrice: getFieldValue(card, '.listPrice') || r.purchasePrice,
    daysOnMarket: getFieldValue(card, '.daysOnMarket') || 0,
    condition: card.querySelector('.propCondition')?.value || 'good',
    propertyType: card.querySelector('.propertyType')?.value || 'single_family',
    appraisedValue: getFieldValue(card, '.appraisedValue') || 0,
    sellerCredits: getFieldValue(card, '.sellerCredits') || 0,
  });

  if (!strategy) {
    document.getElementById('offerPanel').innerHTML = '<p class="analysis-empty">Enter a list price to generate offer strategy.</p>';
    return;
  }

  document.getElementById('offerPanel').innerHTML = `
    <div class="analysis-card">
      <h3>🤝 Offer Strategy</h3>
      <p class="analysis-subtitle">Based on ${strategy.daysOnMarket} days on market, ${strategy.condition} condition</p>

      <div class="offer-signals">
        ${strategy.signals.map(s => `
          <div class="offer-signal ${s.level || ''}">
            <span class="signal-arrow">${s.arrow === 'up' ? '▲' : s.arrow === 'down' ? '▼' : '▸'}</span>
            <strong>${s.label}</strong>
            <span class="signal-note">${s.note}</span>
          </div>
        `).join('')}
      </div>

      <div class="offer-range">
        <div class="offer-card offer-aggressive">
          <div class="offer-type">Aggressive</div>
          <div class="offer-price">${strategy.formatted.aggressive}</div>
          <div class="offer-disc">-${strategy.offers.aggressive.discount.toFixed(1)}% from list</div>
        </div>
        <div class="offer-card offer-moderate">
          <div class="offer-type">Moderate</div>
          <div class="offer-price">${strategy.formatted.moderate}</div>
          <div class="offer-disc">-${strategy.offers.moderate.discount.toFixed(1)}% from list</div>
        </div>
        <div class="offer-card offer-conservative">
          <div class="offer-type">Conservative</div>
          <div class="offer-price">${strategy.formatted.conservative}</div>
          <div class="offer-disc">-${strategy.offers.conservative.discount.toFixed(1)}% from list</div>
        </div>
      </div>
      <p class="offer-note">List Price: ${fmt(strategy.listPrice)} | Savings range: ${fmt(strategy.listPrice - strategy.offers.aggressive.price)} to ${fmt(strategy.listPrice - strategy.offers.conservative.price)}</p>
    </div>
  `;
}

// ── Stress Test ──
function renderStressTest(ctx) {
  const r = ctx.result;
  const card = ctx.card;
  const cashReserves = getFieldValue(card, '.existingHomeEquity') || 0; // proxy for reserves

  const st = stressTest({
    monthlyPI: r.monthlyPI || 0,
    totalMonthly: r.totalMonthly || 0,
    grossMonthlyIncome: r.grossMonthlyIncome || 0,
    loanAmount: r.loanAmount || 0,
    interestRate: r.interestRate || 7,
    loanTermYears: r.loanTermYears || 30,
    cashReserves: cashReserves,
    monthlyDebts: r.monthlyDebts || 0,
  });

  document.getElementById('stressPanel').innerHTML = `
    <div class="analysis-card">
      <h3>🔥 Stress Test</h3>
      <p class="analysis-subtitle">How does this property hold up under adversity?</p>

      <table class="comp-table">
        <thead>
          <tr><th>Scenario</th><th>New Value</th><th>Payment</th><th>Increase</th><th>DTI</th><th>Survives?</th></tr>
        </thead>
        <tbody>
          ${st.scenarios.map(s => `
            <tr class="${s.survives ? '' : 'row-danger'}">
              <td><strong>${s.scenario}</strong></td>
              <td>${s.newValue}</td>
              <td>${s.formatted.newPayment}</td>
              <td>${s.formatted.increase}</td>
              <td class="${s.newDTI > 43 ? 'text-danger' : s.newDTI > 36 ? 'text-warning' : 'text-success'}">${s.formatted.newDTI}</td>
              <td>${s.survives ? '<span class="text-success">✅ Yes</span>' : '<span class="text-danger">❌ No</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${st.jobLossRunway ? `
        <div class="job-loss-panel ${st.jobLossRunway.safe ? 'jl-safe' : 'jl-danger'}">
          <h4>💼 Job Loss Runway</h4>
          <div class="jl-grid">
            <div><strong>Reserves:</strong> ${st.jobLossRunway.formatted.reserves}</div>
            <div><strong>Monthly Burn:</strong> ${st.jobLossRunway.formatted.monthlyBurn}</div>
            <div><strong>Runway:</strong> <span class="${st.jobLossRunway.safe ? 'text-success' : 'text-danger'}">${st.jobLossRunway.formatted.months}</span></div>
            <div>${st.jobLossRunway.safe ? '✅ 6+ months reserve — safe buffer' : '⚠️ Under 6 months — build reserves before buying'}</div>
          </div>
        </div>
      ` : `
        <div class="job-loss-panel jl-neutral">
          <h4>💼 Job Loss Runway</h4>
          <p>Enter existing home equity / reserves to calculate job loss runway.</p>
        </div>
      `}
    </div>
  `;
}

// ── Equity vs Interest Crossover ──
function renderEquityCrossover(ctx) {
  const r = ctx.result;

  const ec = equityCrossover({
    purchasePrice: r.purchasePrice || 0,
    loanAmount: r.loanAmount || 0,
    interestRate: r.interestRate || 7,
    loanTermYears: r.loanTermYears || 30,
    annualAppreciation: 3,
  });

  // Build visual bar showing crossover point
  const termMonths = (r.loanTermYears || 30) * 12;
  const crossPct = ec.crossoverMonth ? (ec.crossoverMonth / termMonths * 100).toFixed(1) : 100;

  document.getElementById('crossoverPanel').innerHTML = `
    <div class="analysis-card">
      <h3>📈 Equity vs Interest Crossover</h3>
      <p class="analysis-subtitle">When does your equity surpass cumulative interest paid? (3% annual appreciation)</p>

      <div class="crossover-summary">
        <div class="crossover-stat">
          <span class="crossover-label">Equity > Interest (with appreciation)</span>
          <span class="crossover-value ${ec.crossoverMonth ? 'text-success' : 'text-danger'}">${ec.formatted.crossover}</span>
        </div>
        <div class="crossover-stat">
          <span class="crossover-label">Principal Paid > Interest (no appreciation)</span>
          <span class="crossover-value">${ec.formatted.pureEquityCrossover}</span>
        </div>
        <div class="crossover-stat">
          <span class="crossover-label">Total Interest Over Life</span>
          <span class="crossover-value text-danger">${fmt(ec.totalInterest)}</span>
        </div>
      </div>

      <div class="crossover-bar-wrap">
        <div class="crossover-bar">
          <div class="crossover-interest-zone" style="width:${crossPct}%"></div>
          <div class="crossover-equity-zone" style="width:${100 - parseFloat(crossPct)}%"></div>
          ${ec.crossoverMonth ? `<div class="crossover-marker" style="left:${crossPct}%"><span>Year ${ec.crossoverYear}</span></div>` : ''}
        </div>
        <div class="crossover-bar-labels">
          <span>Start</span>
          <span>${ec.crossoverMonth ? `Crossover: Year ${ec.crossoverYear}` : 'No crossover'}</span>
          <span>Year ${r.loanTermYears || 30}</span>
        </div>
      </div>

      <h4 style="margin-top:16px;">Milestone Snapshots</h4>
      <table class="comp-table">
        <thead><tr><th>Year</th><th>Equity</th><th>Cumulative Interest</th><th>Net Position</th><th>Home Value</th></tr></thead>
        <tbody>
          ${ec.yearlyData.filter(y => [1,3,5,7,10,15,20,25,30].includes(y.year)).map(y => `
            <tr>
              <td><strong>${y.year}</strong></td>
              <td class="text-success">${fmt(y.equity)}</td>
              <td class="text-danger">${fmt(y.cumulativeInterest)}</td>
              <td class="${y.netPosition >= 0 ? 'text-success' : 'text-danger'}">${fmt(y.netPosition)}</td>
              <td>${fmt(y.homeValue)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Budget Waterfall ──
function renderBudgetWaterfall(ctx) {
  const r = ctx.result;
  const gross = r.grossMonthlyIncome || 0;
  if (gross <= 0) {
    document.getElementById('waterfallPanel').innerHTML = '<p class="analysis-empty">Enter gross monthly income to see budget waterfall.</p>';
    return;
  }

  const housing = r.totalMonthly || 0;
  const utilities = r.totalMonthlyUtilities || 0;
  const debts = r.monthlyDebts || 0;
  const maintenance = (r.purchasePrice || 0) * 0.01 / 12;
  const savings = gross * 0.10; // recommended 10%
  const committed = housing + utilities + debts + maintenance;
  const discretionary = Math.max(0, gross - committed - savings);
  const totalOut = committed + savings;

  const segments = [
    { label: 'Housing (PITI)', value: housing, color: 'var(--primary)' },
    { label: 'Utilities', value: utilities, color: 'var(--info)' },
    { label: 'Other Debts', value: debts, color: 'var(--warning)' },
    { label: 'Maintenance (1%)', value: maintenance, color: '#8b5cf6' },
    { label: 'Savings (10%)', value: savings, color: 'var(--success)' },
    { label: 'Discretionary', value: discretionary, color: '#64748b' },
  ];

  document.getElementById('waterfallPanel').innerHTML = `
    <div class="analysis-card">
      <h3>🌊 Monthly Budget Waterfall</h3>
      <p class="analysis-subtitle">Where every dollar goes — ${fmt(gross)} gross monthly income</p>

      <div class="waterfall-bar">
        ${segments.map(s => {
          const pct = (s.value / gross * 100);
          return pct > 0.5 ? `<div class="waterfall-segment" style="width:${pct.toFixed(1)}%;background:${s.color};" title="${s.label}: ${pct.toFixed(1)}%"></div>` : '';
        }).join('')}
      </div>

      <div class="waterfall-legend">
        ${segments.map(s => {
          const pct = (s.value / gross * 100).toFixed(1);
          return `
            <div class="waterfall-item">
              <span class="legend-dot" style="background:${s.color}"></span>
              <span class="waterfall-label">${s.label}</span>
              <span class="waterfall-amount">${fmt(s.value)}</span>
              <span class="waterfall-pct">${pct}%</span>
            </div>
          `;
        }).join('')}
      </div>

      <div class="waterfall-totals">
        <div class="wf-total"><span>Total Committed</span><span class="${committed / gross > 0.5 ? 'text-danger' : 'text-success'}">${fmt(committed)} (${(committed / gross * 100).toFixed(1)}%)</span></div>
        <div class="wf-total"><span>Remaining After Savings</span><span class="${discretionary < 500 ? 'text-danger' : 'text-success'}">${fmt(discretionary)} (${(discretionary / gross * 100).toFixed(1)}%)</span></div>
      </div>

      ${discretionary < 300 ? '<div class="wf-warning">⚠️ Less than $300/mo discretionary — tight budget, limited buffer for unexpected expenses</div>' : ''}
      ${committed / gross > 0.6 ? '<div class="wf-warning">⚠️ Over 60% of income committed to obligations — consider lower-cost options</div>' : ''}
    </div>
  `;
}

// ============================================================
//  Scenarios
// ============================================================

function applyScenario(card, id) {
  const scenario = card.querySelector('.scenarioSelector').value;
  if (!scenario) return;

  const scenarios = {
    first_time_fha: { loanType: 'fha', downPaymentPct: 3.5, creditTier: 'tier3' },
    conventional_20: { loanType: 'conventional', downPaymentPct: 20, creditTier: 'tier1' },
    conventional_10: { loanType: 'conventional', downPaymentPct: 10, creditTier: 'tier2' },
    conventional_5: { loanType: 'conventional', downPaymentPct: 5, creditTier: 'tier2' },
    va_zero_down: { loanType: 'va', downPaymentPct: 0, creditTier: 'tier1' },
    usda_rural: { loanType: 'usda', downPaymentPct: 0, creditTier: 'tier2' },
    lease_to_own: { dealType: 'leasetoown' },
    rent_vs_buy_10yr: { dealType: 'rentvsbuy', yearsToCompare: 10 },
    arm_5_1: { dealType: 'arm', fixedPeriodYears: 5, initialRate: 6.0 },
    ga_cobb_homestead: { propState: 'GA', homesteadExemption: 2000, assessmentRatio: 40 },
    ga_cobb_senior: { propState: 'GA', homesteadExemption: 2000, seniorExemption: 4000, assessmentRatio: 40 },
    ga_cobb_veteran: { propState: 'GA', homesteadExemption: 2000, veteranExemption: 60000, assessmentRatio: 40 },
    refi_rate_drop: { dealType: 'refinance' },
    refi_cash_out: { dealType: 'refinance', cashOutAmount: 30000 },
    refi_term_reduce: { dealType: 'refinance', newTermYears: 15 },
  };

  const s = scenarios[scenario];
  if (!s) return;

  // Apply values
  for (const [key, value] of Object.entries(s)) {
    const el = card.querySelector(`.${key}`);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('change'));
    }
  }

  if (s.dealType) {
    card.querySelector('.dealType').value = s.dealType;
    toggleConditionalSections(card, s.dealType);
  }

  showToast(`Scenario "${scenario}" applied`);
}

// ============================================================
//  Theme Toggle
// ============================================================

function toggleTheme() {
  // Sync with main app's theme toggle
  document.body.classList.toggle('dark-theme');
  const mainBtn = document.getElementById('themeToggleBtn');
  const isDark = document.body.classList.contains('dark-theme');
  if (mainBtn) mainBtn.textContent = isDark ? '☀️ Light' : '🌙 Theme';
}

// ============================================================
//  Export CSV
// ============================================================

function exportCSV() {
  const rows = [['Property', 'Type', 'Monthly', 'Total Cost', 'Cash at Closing']];
  let i = 1;
  for (const [id, prop] of properties) {
    if (!prop.results) continue;
    const r = prop.results;
    let monthly = 0, total = 0, cash = 0;
    if (r.type === 'mortgage') {
      monthly = r.totalMonthly; total = r.totalCostOfOwnership; cash = r.cashAtClosing;
    } else if (r.type === 'refinance') {
      monthly = r.newMonthlyPI; total = r.newMonthlyPI * r.newTermMonths; cash = r.totalRefiCost;
    }
    rows.push([`Property ${i++}`, r.type, monthly.toFixed(2), total.toFixed(2), cash.toFixed(2)]);
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'housing_comparison.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported');
}

