// ╔══════════════════════════════════════════════════════════════════╗
// ║  daddy's Lease Hackulator v3  —  Main Application Controller   ║
// ║  Vehicle management, UI events, comparison, export, theme      ║
// ╚══════════════════════════════════════════════════════════════════╝

import {
  fmt, fmtPct, formatMoneyFactor, getNum, mfToApr, aprToMf,
  showToast, setFieldValue, getFieldValue, debounce,
  haversineDistance, STATE_TAX_RATES, getStateTaxRate,
} from './utils.js';

import {
  MANUFACTURER_FEES, FALLBACK_RESIDUALS,
  loadExternalData, getManufacturerFees, getResidualValue,
  lookupEPAData, classifyVehicle, getScenarios,
} from './data.js';

import {
  decodeVIN, fetchListingData, lookupZIP, fetchIncentives,
  calculateDistance, fullVINLookup,
} from './api.js';

import {
  calculateLease, calculateFinance, calculateBalloon,
  calculateSinglePayLease, calculateFuelCost, compareDeals,
} from './calculations.js';


// ────────────────────────────────────────────────────────────────
//  STATE
// ────────────────────────────────────────────────────────────────
let vehicleCount = 0;
const vehicles = new Map();         // id → { card, data, results }
let userLocation = null;            // { lat, lon, zip, city, state }
let isDark = false;

const WEIGHT_PRESETS = {
  equal:    { monthly: 25, total: 25, cpm: 25, driveoff: 25 },
  cost:     { monthly: 10, total: 50, cpm: 30, driveoff: 10 },
  payment:  { monthly: 50, total: 15, cpm: 15, driveoff: 20 },
  balanced: { monthly: 30, total: 30, cpm: 20, driveoff: 20 },
};
let currentWeights = { ...WEIGHT_PRESETS.equal };


// ────────────────────────────────────────────────────────────────
//  INIT
// ────────────────────────────────────────────────────────────────
// Import housing module for cross-domain bridge
import { initHousing, getHousingResults, getHousingProperties, crossDomainComparison } from './housing-app.js';

document.addEventListener('DOMContentLoaded', async () => {
  await loadExternalData();
  setupGlobalActions();
  addVehicleCard();
  initHousing();
  setupDomainTabs();
  showToast('Hackulator v3 loaded');
});


// ────────────────────────────────────────────────────────────────
//  GLOBAL ACTIONS (Action Bar)
// ────────────────────────────────────────────────────────────────
function setupGlobalActions() {
  document.getElementById('addVehicleBtn')?.addEventListener('click', () => addVehicleCard());
  document.getElementById('vCalculateAllBtn')?.addEventListener('click', () => calculateAllVehicles());
  document.getElementById('vCompareBtn')?.addEventListener('click', () => toggleComparison());
  document.getElementById('vMatrixBtn')?.addEventListener('click', () => toggleMatrix());
  document.getElementById('vExportCSVBtn')?.addEventListener('click', () => exportCSV());
  document.getElementById('printBtn')?.addEventListener('click', () => window.print());
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => toggleTheme());

  // Weight preset buttons (scoped to vehicle controls)
  document.querySelectorAll('#vWeightControls .weight-btn[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#vWeightControls .weight-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentWeights = { ...WEIGHT_PRESETS[btn.dataset.preset] };
      if (!document.getElementById('vComparisonSection').classList.contains('hidden')) {
        buildComparisonTable();
      }
    });
  });

  // Combined analysis button
  document.getElementById('runCombinedBtn')?.addEventListener('click', () => runCombinedAnalysis());
}

// ────────────────────────────────────────────────────────────────
//  DOMAIN TAB SWITCHING
// ────────────────────────────────────────────────────────────────
function setupDomainTabs() {
  const tabs = document.querySelectorAll('.domain-tab');
  const panels = document.querySelectorAll('.domain-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const domain = tab.dataset.domain;
      const panel = document.getElementById(domain + 'Domain');
      if (panel) panel.classList.add('active');
    });
  });
}

// ────────────────────────────────────────────────────────────────
//  COMBINED CROSS-DOMAIN ANALYSIS
// ────────────────────────────────────────────────────────────────
function runCombinedAnalysis() {
  const output = document.getElementById('combinedOutput');
  if (!output) return;

  // Gather vehicle results
  const vehicleResults = [];
  vehicles.forEach((entry, id) => {
    if (!entry.results) return;
    const card = entry.card;
    const dealType = card.querySelector('.dealType')?.value || 'lease';
    const label = `Vehicle ${id}: ${card.querySelector('.year')?.value || ''} ${card.querySelector('.make')?.value || ''} ${card.querySelector('.model')?.value || ''}`.trim();
    let monthly = 0;
    switch (dealType) {
      case 'finance': monthly = entry.results.finance?.monthlyPayment || 0; break;
      case 'balloon': case 'balloonfinance': monthly = entry.results.balloon?.initialPayment || 0; break;
      default: monthly = entry.results.lease?.totalMonthly || 0;
    }
    vehicleResults.push({ label, monthly, type: 'vehicle' });
  });

  // Gather housing results
  const housingResults = [];
  const hProps = getHousingProperties();
  let idx = 1;
  for (const [id, prop] of hProps) {
    if (!prop.results) continue;
    const r = prop.results;
    const card = prop.card;
    const addr = card?.querySelector('.propertyAddress')?.value || `Property ${idx}`;
    let monthly = 0;
    if (r.type === 'mortgage' || r.type === 'arm') monthly = r.totalMonthly || 0;
    else if (r.type === 'refinance') monthly = r.newMonthlyPI || 0;
    else if (r.type === 'rentvsbuy') monthly = r.totalMonthly || 0;
    else if (r.type === 'leasetoown') monthly = r.monthlyPayment || 0;
    housingResults.push({
      label: addr,
      monthly,
      type: 'housing',
      results: r,
      grossIncome: getNum(card?.querySelector('.grossMonthlyIncome')?.value),
      monthlyDebts: getNum(card?.querySelector('.monthlyDebts')?.value),
    });
    idx++;
  }

  if (vehicleResults.length === 0 && housingResults.length === 0) {
    output.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">Calculate at least one vehicle and one property first, then run Combined Analysis.</p>';
    return;
  }

  if (vehicleResults.length === 0) {
    output.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">No calculated vehicles found. Add and calculate vehicles on the Vehicles tab first.</p>';
    return;
  }

  if (housingResults.length === 0) {
    output.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">No calculated properties found. Add and calculate properties on the Housing tab first.</p>';
    return;
  }

  // Build pairings
  let html = '<div class="cross-domain-panel"><h3>🔄 Vehicle × Housing Pairings</h3>';
  html += '<table class="comp-table"><thead><tr><th>Pairing</th><th>Vehicle $/mo</th><th>Housing $/mo</th><th>Combined $/mo</th><th>Combined DTI</th><th>Grade</th></tr></thead><tbody>';

  let bestPairing = null;
  let bestCombined = Infinity;

  vehicleResults.forEach(v => {
    housingResults.forEach(h => {
      const combined = v.monthly + h.monthly;
      const income = h.grossIncome || 0;
      const debts = h.monthlyDebts || 0;
      const dti = income > 0 ? ((combined + debts) / income * 100) : 0;
      let grade = '—';
      if (income > 0) {
        if (dti <= 28) grade = '🟢 A+';
        else if (dti <= 33) grade = '🟢 A';
        else if (dti <= 36) grade = '🟡 B';
        else if (dti <= 43) grade = '🟠 C';
        else if (dti <= 50) grade = '🔴 D';
        else grade = '🔴 F';
      }

      if (combined < bestCombined) {
        bestCombined = combined;
        bestPairing = { v: v.label, h: h.label, combined, dti, grade };
      }

      html += `<tr>
        <td><strong>${v.label}</strong> + <strong>${h.label}</strong></td>
        <td>${fmt(v.monthly)}</td>
        <td>${fmt(h.monthly)}</td>
        <td><strong>${fmt(combined)}</strong></td>
        <td>${income > 0 ? dti.toFixed(1) + '%' : '—'}</td>
        <td>${grade}</td>
      </tr>`;
    });
  });

  html += '</tbody></table>';

  if (bestPairing) {
    html = `<div class="winner-banner" style="margin-bottom:20px;">
      <span class="winner-icon">🏆</span>
      <div class="winner-details">
        <strong>Best Pairing:</strong> ${bestPairing.v} + ${bestPairing.h}<br>
        Combined: <strong>${fmt(bestPairing.combined)}/mo</strong> ${bestPairing.dti > 0 ? `| DTI: ${bestPairing.dti.toFixed(1)}% ${bestPairing.grade}` : ''}
      </div>
    </div>` + html;
  }

  html += '</div>';
  output.innerHTML = html;
  showToast('Combined analysis complete');
}


// ────────────────────────────────────────────────────────────────
//  VEHICLE CARD MANAGEMENT
// ────────────────────────────────────────────────────────────────
function addVehicleCard(copyFrom = null) {
  vehicleCount++;
  const id = vehicleCount;
  const template = document.getElementById('vehicleCardTemplate');
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector('.vehicle-card');
  card.dataset.id = id;
  card.querySelector('.v-num').textContent = id;

  // Fix radio group names to be unique per card
  card.querySelectorAll('[name="fuelType"]').forEach(radio => {
    radio.name = `fuelType_${id}`;
  });

  // If copying from existing
  if (copyFrom) {
    const srcCard = vehicles.get(copyFrom)?.card;
    if (srcCard) {
      srcCard.querySelectorAll('input, select').forEach(input => {
        const cls = input.className.split(' ')[0];
        if (!cls) return;
        const target = card.querySelector(`.${cls}`);
        if (target) {
          if (input.type === 'checkbox') target.checked = input.checked;
          else if (input.type === 'radio') {
            const tRadio = card.querySelector(`.${cls}[value="${input.value}"]`);
            if (tRadio) tRadio.checked = input.checked;
          } else target.value = input.value;
        }
      });
    }
  }

  // Store vehicle entry
  vehicles.set(id, { card, data: {}, results: null });

  // Attach card-level event listeners
  setupCardEvents(card, id);

  // Populate scenarios dropdown
  populateScenarios(card);

  document.getElementById('vehiclesContainer').appendChild(card);
  showToast(`Vehicle ${id} added`);
  return id;
}

function removeVehicleCard(id) {
  const entry = vehicles.get(id);
  if (!entry) return;
  entry.card.remove();
  vehicles.delete(id);
  showToast(`Vehicle ${id} removed`);
  renumberCards();
}

function clearVehicleCard(id) {
  const entry = vehicles.get(id);
  if (!entry) return;
  const card = entry.card;
  card.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])').forEach(input => {
    if (input.classList.contains('avgGasPrice')) input.value = '3.25';
    else if (input.classList.contains('l2electricityCost')) input.value = '0.1855';
    else if (input.classList.contains('l3electricityCost')) input.value = '0.4555';
    else if (input.classList.contains('moneyFactor')) input.value = '0.00125';
    else if (input.classList.contains('apr')) input.value = '3.00';
    else if (input.classList.contains('residualPct')) input.value = '55';
    else if (input.classList.contains('taxRate')) input.value = '7.00';
    else if (input.classList.contains('acqFee')) input.value = '695';
    else if (input.classList.contains('docFee')) input.value = '299';
    else if (input.classList.contains('dispFee')) input.value = '395';
    else if (input.classList.contains('msdCount')) input.value = '7';
    else if (input.classList.contains('msdReduction')) input.value = '0.00007';
    else if (input.classList.contains('phevElectricPct')) input.value = '60';
    else if (input.classList.contains('balloonTerm')) input.value = '60';
    else if (input.classList.contains('balloonMonthDue')) input.value = '36';
    else if (input.classList.contains('balloonNewTerm')) input.value = '24';
    else if (input.readOnly) input.value = input.type === 'text' ? '--' : '0';
    else input.value = '0';
  });
  card.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  card.querySelectorAll('select').forEach(sel => sel.selectedIndex = 0);
  // Reset fuel type to gas
  const gasRadio = card.querySelector(`.fuelTypeRadio[value="gas"]`);
  if (gasRadio) { gasRadio.checked = true; toggleFuelFields(card, 'gas'); }
  // Reset badges
  card.querySelectorAll('.credit-tier-badge, .condition-badge, .distance-badge').forEach(b => {
    b.classList.add('hidden');
  });
  entry.results = null;
  showToast(`Vehicle ${id} cleared`);
}

function clearAllVehicles() {
  vehicles.forEach((_, id) => removeVehicleCard(id));
  vehicleCount = 0;
  addVehicleCard();
}

function renumberCards() {
  let n = 0;
  vehicles.forEach((entry) => {
    n++;
    entry.card.querySelector('.v-num').textContent = n;
  });
}


// ────────────────────────────────────────────────────────────────
//  CARD EVENT WIRING
// ────────────────────────────────────────────────────────────────
function setupCardEvents(card, id) {
  // Card control buttons
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      switch (action) {
        case 'duplicate': addVehicleCard(id); break;
        case 'clear': clearVehicleCard(id); break;
        case 'remove': removeVehicleCard(id); break;
        case 'decode-vin': handleVINDecode(card, id); break;
        case 'fetch-incentives': handleFetchIncentives(card, id); break;
        case 'apply-scenario': handleApplyScenario(card, id); break;
      }
    });
  });

  // Tab switching
  card.querySelectorAll('.vehicle-tab-btn').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      card.querySelectorAll('.vehicle-tab-btn').forEach(b => b.classList.remove('active'));
      card.querySelectorAll('.vehicle-tab-content').forEach(c => c.classList.remove('active'));
      tabBtn.classList.add('active');
      card.querySelector(`.vehicle-tab-content[data-tab="${tabBtn.dataset.tab}"]`)?.classList.add('active');
    });
  });

  // Fuel type radio toggle
  card.querySelectorAll('.fuelTypeRadio').forEach(radio => {
    radio.addEventListener('change', () => toggleFuelFields(card, radio.value));
  });

  // APR ↔ MF sync
  const mfInput = card.querySelector('.moneyFactor');
  const aprInput = card.querySelector('.apr');
  const mfDisplay = card.querySelector('.mf-apr-display');

  if (mfInput) {
    mfInput.addEventListener('input', debounce(() => {
      const mf = parseFloat(mfInput.value) || 0;
      const apr = mfToApr(mf);
      if (aprInput) aprInput.value = apr.toFixed(2);
      if (mfDisplay) mfDisplay.textContent = `MF ${mf.toFixed(5)} = ${apr.toFixed(2)}% APR`;
      updateEffectiveMF(card);
    }, 200));
  }
  if (aprInput) {
    aprInput.addEventListener('input', debounce(() => {
      const apr = parseFloat(aprInput.value) || 0;
      const mf = aprToMf(apr);
      if (mfInput) mfInput.value = mf.toFixed(5);
      if (mfDisplay) mfDisplay.textContent = `MF ${mf.toFixed(5)} = ${apr.toFixed(2)}% APR`;
      updateEffectiveMF(card);
    }, 200));
  }

  // Residual % ↔ $ sync
  const resPct = card.querySelector('.residualPct');
  const resVal = card.querySelector('.residualValue');
  const msrpInput = card.querySelector('.msrp');

  if (resPct) {
    resPct.addEventListener('input', debounce(() => {
      const msrp = getNum(msrpInput?.value);
      const pct = parseFloat(resPct.value) || 0;
      if (resVal) resVal.value = Math.round(msrp * pct / 100);
    }, 200));
  }
  if (resVal) {
    resVal.addEventListener('input', debounce(() => {
      const msrp = getNum(msrpInput?.value);
      const val = getNum(resVal.value);
      if (msrp > 0 && resPct) resPct.value = ((val / msrp) * 100).toFixed(2);
    }, 200));
  }

  // MSRP change → update residual $ + discount display
  if (msrpInput) {
    msrpInput.addEventListener('input', debounce(() => {
      const msrp = getNum(msrpInput.value);
      const pct = parseFloat(resPct?.value) || 55;
      if (resVal) resVal.value = Math.round(msrp * pct / 100);
      updateDiscount(card);
    }, 200));
  }

  // Selling price change → update discount display
  const sellingInput = card.querySelector('.sellingPrice');
  if (sellingInput) {
    sellingInput.addEventListener('input', debounce(() => updateDiscount(card), 200));
  }

  // Trade equity auto-calc
  const tradeAllow = card.querySelector('.tradeAllowance');
  const payoff = card.querySelector('.payoffAmount');
  const tradeEq = card.querySelector('.tradeEquity');
  const calcTrade = debounce(() => {
    const allow = getNum(tradeAllow?.value);
    const pay = getNum(payoff?.value);
    if (tradeEq) tradeEq.value = allow - pay;
  }, 200);
  tradeAllow?.addEventListener('input', calcTrade);
  payoff?.addEventListener('input', calcTrade);

  // Trade scenario → show/hide check-back
  const tradeSel = card.querySelector('.tradeScenario');
  tradeSel?.addEventListener('change', () => {
    const cbField = card.querySelector('.check-back-field');
    if (tradeSel.value === 'checkback') {
      cbField?.classList.remove('hidden');
      const eq = getNum(tradeEq?.value);
      const cbAmt = card.querySelector('.checkBackAmount');
      if (cbAmt) cbAmt.value = Math.max(0, eq);
    } else {
      cbField?.classList.add('hidden');
    }
  });

  // MSD enable/disable
  const msdCheck = card.querySelector('.msdActive');
  const msdFields = card.querySelector('.msd-fields');
  msdCheck?.addEventListener('change', () => {
    if (msdCheck.checked) msdFields?.classList.remove('hidden');
    else msdFields?.classList.add('hidden');
    updateEffectiveMF(card);
  });
  card.querySelector('.msdCount')?.addEventListener('input', () => updateEffectiveMF(card));

  // Zero drive-off → check all cap checkboxes
  const zeroCheck = card.querySelector('.zeroDrive');
  zeroCheck?.addEventListener('change', () => {
    const caps = ['capAcquisition', 'capDealer', 'capReg', 'capTitle', 'capOther'];
    caps.forEach(cls => {
      const cb = card.querySelector(`.${cls}`);
      if (cb) cb.checked = zeroCheck.checked;
    });
    updateFeeTotals(card);
  });

  // Cap checkboxes → update fee totals
  ['capAcquisition', 'capDealer', 'capReg', 'capTitle', 'capOther'].forEach(cls => {
    card.querySelector(`.${cls}`)?.addEventListener('change', () => updateFeeTotals(card));
  });
  // Fee inputs → update totals
  ['acqFee', 'docFee', 'regFee', 'titleFee', 'otherFees'].forEach(cls => {
    card.querySelector(`.${cls}`)?.addEventListener('input', debounce(() => updateFeeTotals(card), 200));
  });

  // Deal type → show/hide relevant sections
  const dealSel = card.querySelector('.dealType');
  dealSel?.addEventListener('change', () => toggleDealFields(card));
  toggleDealFields(card); // initial state

  // Credit tier badge
  const tierSel = card.querySelector('.creditTier');
  tierSel?.addEventListener('change', () => {
    const badge = card.querySelector('.credit-tier-badge');
    if (badge) {
      badge.textContent = `Tier ${tierSel.value}`;
      badge.classList.remove('hidden');
    }
  });

  // Condition badge
  const condSel = card.querySelector('.condition');
  condSel?.addEventListener('change', () => {
    const badge = card.querySelector('.condition-badge');
    if (badge) {
      badge.textContent = condSel.options[condSel.selectedIndex].text;
      badge.classList.remove('hidden');
    }
  });

  // ZIP auto-lookup
  const zipInput = card.querySelector('.zip');
  zipInput?.addEventListener('input', debounce(() => {
    if (zipInput.value.length === 5) handleZIPLookup(card, id);
  }, 500));

  // Scenario select
  const scenSel = card.querySelector('.scenarioSelect');
  scenSel?.addEventListener('change', () => {
    const details = card.querySelector('.scenario-details');
    const info = card.querySelector('.scenario-info');
    if (!scenSel.value) { details?.classList.add('hidden'); return; }
    const scenarios = getScenarios();
    const s = scenarios.find(sc => sc.id === scenSel.value);
    if (s && info) {
      info.innerHTML = `<p><strong>${s.name}</strong></p><p>${s.description || ''}</p>`;
      details?.classList.remove('hidden');
    }
  });
}


// ────────────────────────────────────────────────────────────────
//  FIELD HELPERS
// ────────────────────────────────────────────────────────────────
function toggleFuelFields(card, fuelType) {
  card.querySelector('.gas-fields')?.classList.toggle('hidden', fuelType !== 'gas');
  card.querySelector('.ev-fields')?.classList.toggle('hidden', fuelType !== 'ev');
  card.querySelector('.phev-fields')?.classList.toggle('hidden', fuelType !== 'phev');
  // Show/hide EV credit field
  card.querySelectorAll('.ev-field').forEach(el => {
    el.classList.toggle('hidden', fuelType === 'gas');
  });
}

function toggleDealFields(card) {
  const dealType = card.querySelector('.dealType')?.value || 'lease';
  const isLease = ['lease', 'balloon'].includes(dealType);
  const isBalloon = ['balloon', 'balloonfinance'].includes(dealType);

  // Show/hide lease-only fields
  card.querySelectorAll('.lease-field').forEach(el => {
    el.classList.toggle('hidden', !isLease && dealType !== 'balloonfinance');
  });

  // Balloon fields
  card.querySelector('.balloon-fields')?.classList.toggle('hidden', !isBalloon);
}

function updateDiscount(card) {
  const msrp = getNum(card.querySelector('.msrp')?.value);
  const selling = getNum(card.querySelector('.sellingPrice')?.value);
  const discField = card.querySelector('.discountFromMsrp');
  if (msrp > 0 && selling > 0 && discField) {
    const diff = msrp - selling;
    const pct = (diff / msrp) * 100;
    discField.value = `${fmt(diff)} (${pct.toFixed(2)}%)`;
  } else if (discField) {
    discField.value = '$0 (0.00%)';
  }
}

function updateEffectiveMF(card) {
  const baseMF = parseFloat(card.querySelector('.moneyFactor')?.value) || 0;
  const msdActive = card.querySelector('.msdActive')?.checked;
  const msdCount = parseInt(card.querySelector('.msdCount')?.value) || 0;
  const msdReduction = parseFloat(card.querySelector('.msdReduction')?.value) || 0.00007;
  const effField = card.querySelector('.effectiveMF');

  if (msdActive && msdCount > 0) {
    const effective = Math.max(0.00001, baseMF - (msdCount * msdReduction));
    if (effField) effField.value = effective.toFixed(5);
  } else {
    if (effField) effField.value = '--';
  }
}

function updateFeeTotals(card) {
  const fees = {
    acq:   { val: getNum(card.querySelector('.acqFee')?.value),   cap: card.querySelector('.capAcquisition')?.checked },
    doc:   { val: getNum(card.querySelector('.docFee')?.value),   cap: card.querySelector('.capDealer')?.checked },
    reg:   { val: getNum(card.querySelector('.regFee')?.value),   cap: card.querySelector('.capReg')?.checked },
    title: { val: getNum(card.querySelector('.titleFee')?.value), cap: card.querySelector('.capTitle')?.checked },
    other: { val: getNum(card.querySelector('.otherFees')?.value),cap: card.querySelector('.capOther')?.checked },
  };

  let capped = 0, atSigning = 0;
  Object.values(fees).forEach(f => {
    if (f.cap) capped += f.val;
    else atSigning += f.val;
  });

  setFieldValue(card, '.totalFeesCapped', fmt(capped));
  setFieldValue(card, '.totalFeesAtSigning', fmt(atSigning));
}

function populateScenarios(card) {
  const sel = card.querySelector('.scenarioSelect');
  if (!sel) return;
  const scenarios = getScenarios();
  scenarios.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
}


// ────────────────────────────────────────────────────────────────
//  VIN DECODE
// ────────────────────────────────────────────────────────────────
async function handleVINDecode(card, id) {
  const vin = card.querySelector('.vin')?.value?.trim();
  if (!vin || vin.length < 11) {
    showToast('Please enter a valid VIN (at least 11 characters)', true);
    return;
  }

  const loading = card.querySelector('.field-loading');
  if (loading) loading.textContent = '⏳ Decoding...';
  const errSpan = card.querySelector('.field-error');
  if (errSpan) errSpan.textContent = '';

  try {
    const zip = card.querySelector('.zip')?.value?.trim() || '';
    const result = await fullVINLookup(vin, zip);

    if (!result) {
      if (errSpan) errSpan.textContent = 'VIN not found';
      showToast('VIN decode failed', true);
      return;
    }

    // Basic vehicle info
    if (result.year) setFieldValue(card, '.year', result.year);
    if (result.make) setFieldValue(card, '.make', result.make);
    if (result.model) setFieldValue(card, '.model', result.model);
    if (result.trim) setFieldValue(card, '.trim', result.trim);
    if (result.exteriorColor) setFieldValue(card, '.exteriorColor', result.exteriorColor);
    if (result.interiorColor) setFieldValue(card, '.interiorColor', result.interiorColor);

    // MSRP & Pricing
    if (result.msrp) {
      setFieldValue(card, '.msrp', result.msrp);
      // Auto-calc residual $
      const resPct = parseFloat(card.querySelector('.residualPct')?.value) || 55;
      setFieldValue(card, '.residualValue', Math.round(result.msrp * resPct / 100));
    }
    if (result.listingPrice) setFieldValue(card, '.listingPrice', result.listingPrice);
    if (result.sellingPrice) setFieldValue(card, '.sellingPrice', result.sellingPrice);
    if (result.mileage) setFieldValue(card, '.listingMiles', result.mileage);

    // Dealer info
    if (result.dealer) {
      if (result.dealer.name) setFieldValue(card, '.dealerName', result.dealer.name);
      if (result.dealer.phone) setFieldValue(card, '.dealerPhone', result.dealer.phone);
      if (result.dealer.location) setFieldValue(card, '.dealerLocation', result.dealer.location);
      if (result.dealer.zip) setFieldValue(card, '.zip', result.dealer.zip);
    }
    if (result.stockNumber) setFieldValue(card, '.stockNumber', result.stockNumber);
    if (result.daysOnMarket) setFieldValue(card, '.daysOnMarket', result.daysOnMarket);
    if (result.source) setFieldValue(card, '.listingSource', result.source);
    if (result.listingUrl) setFieldValue(card, '.listingUrl', result.listingUrl);

    // Fuel type
    if (result.fuelType) {
      const fuelMap = { 'electric': 'ev', 'plug-in hybrid': 'phev', 'hybrid': 'gas', 'gasoline': 'gas', 'diesel': 'gas' };
      const ft = fuelMap[result.fuelType?.toLowerCase()] || 'gas';
      const radio = card.querySelector(`.fuelTypeRadio[value="${ft}"]`);
      if (radio) { radio.checked = true; toggleFuelFields(card, ft); }
    }

    // EPA data
    if (result.epa) {
      if (result.epa.cityMpg) setFieldValue(card, '.epaCityMpg', result.epa.cityMpg);
      if (result.epa.hwyMpg) setFieldValue(card, '.epaHwyMpg', result.epa.hwyMpg);
      if (result.epa.combinedMpg) setFieldValue(card, '.epaCombinedMpg', result.epa.combinedMpg);
      if (result.epa.fuelTankSize) setFieldValue(card, '.fuelTankSize', result.epa.fuelTankSize);
      if (result.epa.mpgeCity) setFieldValue(card, '.mpgeCity', result.epa.mpgeCity);
      if (result.epa.mpgeHwy) setFieldValue(card, '.mpgeHwy', result.epa.mpgeHwy);
      if (result.epa.mpgeCombined) setFieldValue(card, '.mpgeCombined', result.epa.mpgeCombined);
      if (result.epa.batterySize) setFieldValue(card, '.batterySize', result.epa.batterySize);
      if (result.epa.range) setFieldValue(card, '.rangeElectric', result.epa.range);
    }

    // Manufacturer fees
    if (result.make) {
      const mfees = getManufacturerFees(result.make);
      if (mfees) {
        if (mfees.acquisitionFee) setFieldValue(card, '.acqFee', mfees.acquisitionFee);
        if (mfees.dispositionFee) setFieldValue(card, '.dispFee', mfees.dispositionFee);
      }
    }

    // Residual lookup
    if (result.make && result.model) {
      const term = parseInt(card.querySelector('.leaseTerm')?.value) || 36;
      const miles = parseInt(card.querySelector('.annualMileage')?.value) || 12000;
      const vClass = classifyVehicle(result.make, result.model, result.bodyType);
      const resVal = getResidualValue(result.make, result.model, term, miles, vClass);
      if (resVal > 0) {
        setFieldValue(card, '.residualPct', resVal);
        if (result.msrp) setFieldValue(card, '.residualValue', Math.round(result.msrp * resVal / 100));
      }
    }

    // Distance from user location
    if (result.dealer?.lat && result.dealer?.lon && userLocation?.lat) {
      const dist = haversineDistance(userLocation.lat, userLocation.lon, result.dealer.lat, result.dealer.lon);
      const badge = card.querySelector('.distance-badge');
      if (badge) { badge.textContent = `${Math.round(dist)} mi`; badge.classList.remove('hidden'); }
      setFieldValue(card, '.dealerDistance', `${Math.round(dist)} miles`);
    }

    updateDiscount(card);
    updateFeeTotals(card);
    showToast(`Vehicle ${id} decoded successfully`);

  } catch (err) {
    console.error('VIN decode error:', err);
    if (errSpan) errSpan.textContent = 'Decode failed';
    showToast('VIN decode error: ' + err.message, true);
  } finally {
    if (loading) loading.textContent = '';
  }
}


// ────────────────────────────────────────────────────────────────
//  ZIP LOOKUP
// ────────────────────────────────────────────────────────────────
async function handleZIPLookup(card, id) {
  const zip = card.querySelector('.zip')?.value?.trim();
  if (!zip || zip.length !== 5) return;

  try {
    const result = await lookupZIP(zip);
    if (result) {
      setFieldValue(card, '.city', result.city || '');
      setFieldValue(card, '.state', result.state || '');
      setFieldValue(card, '.county', result.county || '');

      // State tax rate
      if (result.state) {
        const rate = getStateTaxRate(result.state);
        setFieldValue(card, '.taxRate', rate.toFixed(2));
      }

      // Store user location for distance calcs
      if (result.lat && result.lon) {
        userLocation = { lat: result.lat, lon: result.lon, zip, city: result.city, state: result.state };
      }
    }
  } catch (err) {
    console.error('ZIP lookup error:', err);
  }
}


// ────────────────────────────────────────────────────────────────
//  FETCH INCENTIVES
// ────────────────────────────────────────────────────────────────
async function handleFetchIncentives(card, id) {
  const zip = card.querySelector('.zip')?.value?.trim() || '';
  const year = card.querySelector('.year')?.value || '';
  const make = card.querySelector('.make')?.value || '';
  const model = card.querySelector('.model')?.value || '';

  if (!year || !make || !model) {
    showToast('Enter Year, Make, Model first', true);
    return;
  }

  try {
    showToast('Fetching incentives...');
    const incentives = await fetchIncentives(zip, year, make, model);

    const section = card.querySelector('.incentives-section');
    const list = card.querySelector('.incentive-list');
    if (!section || !list) return;

    if (!incentives || incentives.length === 0) {
      list.innerHTML = '<p>No incentives found for this vehicle/ZIP combination.</p>';
      section.classList.remove('hidden');
      return;
    }

    list.innerHTML = incentives.map(inc => `
      <div class="incentive-card">
        <div class="incentive-name">${inc.name || 'Incentive'}</div>
        <div class="incentive-amount">${fmt(inc.amount || 0)}</div>
        <div class="incentive-type">${inc.type || ''}</div>
        <button class="btn btn-small" onclick="this.closest('.vehicle-card').querySelector('.${inc.type === 'lease' ? 'leaseIncentives' : 'financeIncentives'}').value = ${inc.amount}; this.textContent = '✓ Applied';">Apply</button>
      </div>
    `).join('');
    section.classList.remove('hidden');
    showToast(`Found ${incentives.length} incentives`);

  } catch (err) {
    console.error('Incentives fetch error:', err);
    showToast('Could not fetch incentives', true);
  }
}


// ────────────────────────────────────────────────────────────────
//  SCENARIO HANDLING
// ────────────────────────────────────────────────────────────────
function handleApplyScenario(card, id) {
  const scenSel = card.querySelector('.scenarioSelect');
  if (!scenSel?.value) return;

  const scenarios = getScenarios();
  const scenario = scenarios.find(s => s.id === scenSel.value);
  if (!scenario) return;

  // Apply scenario overrides to the card
  if (scenario.overrides) {
    Object.entries(scenario.overrides).forEach(([field, value]) => {
      const input = card.querySelector(`.${field}`);
      if (input) {
        if (input.type === 'checkbox') input.checked = !!value;
        else input.value = value;
        input.dispatchEvent(new Event('change'));
      }
    });
  }

  // Run calculation with scenario applied
  const params = gatherParams(card);
  const result = calculateLease(params);

  // Show scenario results
  const output = card.querySelector('.scenario-output');
  const resultsDiv = card.querySelector('.scenario-results');
  if (output && resultsDiv) {
    output.innerHTML = `
      <div class="breakdown-detail highlight-green"><strong>Monthly Payment</strong><span>${result.formatted.totalMonthly}</span></div>
      <div class="breakdown-detail"><strong>Due at Signing</strong><span>${result.formatted.totalDueAtSigning}</span></div>
      <div class="breakdown-detail"><strong>Total Cost</strong><span>${result.formatted.totalCostToOwn}</span></div>
      <div class="breakdown-detail"><strong>Cost Per Mile</strong><span>${result.formatted.costPerMile}</span></div>
    `;
    resultsDiv.classList.remove('hidden');
  }
  showToast(`Scenario "${scenario.name}" applied`);
}


// ────────────────────────────────────────────────────────────────
//  GATHER PARAMS FROM CARD
// ────────────────────────────────────────────────────────────────
function gatherParams(card) {
  const fuelType = card.querySelector('.fuelTypeRadio:checked')?.value || 'gas';

  return {
    msrp:            getNum(card.querySelector('.msrp')?.value),
    sellingPrice:    getNum(card.querySelector('.sellingPrice')?.value),
    residualPct:     parseFloat(card.querySelector('.residualPct')?.value) || 55,
    moneyFactor:     parseFloat(card.querySelector('.moneyFactor')?.value) || 0.00125,
    term:            parseInt(card.querySelector('.leaseTerm')?.value) || 36,
    annualMiles:     parseInt(card.querySelector('.annualMileage')?.value) || 12000,

    downPayment:     getNum(card.querySelector('.downPayment')?.value),
    downScenario:    card.querySelector('.downScenario')?.value || 'capreduction',
    tradeAllowance:  getNum(card.querySelector('.tradeAllowance')?.value),
    payoffAmount:    getNum(card.querySelector('.payoffAmount')?.value),
    tradeScenario:   card.querySelector('.tradeScenario')?.value || 'capreduction',

    leaseIncentives:   getNum(card.querySelector('.leaseIncentives')?.value),
    financeIncentives: getNum(card.querySelector('.financeIncentives')?.value),
    stateCredit:       getNum(card.querySelector('.stateCredit')?.value),

    acqFee:    getNum(card.querySelector('.acqFee')?.value),
    docFee:    getNum(card.querySelector('.docFee')?.value),
    regFee:    getNum(card.querySelector('.regFee')?.value),
    titleFee:  getNum(card.querySelector('.titleFee')?.value),
    otherFees: getNum(card.querySelector('.otherFees')?.value),

    capAcquisition: card.querySelector('.capAcquisition')?.checked,
    capDealer:      card.querySelector('.capDealer')?.checked,
    capReg:         card.querySelector('.capReg')?.checked,
    capTitle:       card.querySelector('.capTitle')?.checked,
    capOther:       card.querySelector('.capOther')?.checked,
    zeroDrive:      card.querySelector('.zeroDrive')?.checked,

    taxRate:    parseFloat(card.querySelector('.taxRate')?.value) || 7,
    taxMethod:  card.querySelector('.taxMethod')?.value || 'Monthly Payment',

    msdActive:    card.querySelector('.msdActive')?.checked,
    msdCount:     parseInt(card.querySelector('.msdCount')?.value) || 7,
    msdReduction: parseFloat(card.querySelector('.msdReduction')?.value) || 0.00007,

    apr: parseFloat(card.querySelector('.apr')?.value) || 3,

    // Fuel params
    fuelType,
    avgGasPrice:       parseFloat(card.querySelector('.avgGasPrice')?.value) || 3.25,
    epaCombinedMpg:    parseFloat(card.querySelector('.epaCombinedMpg')?.value) || 25,
    mpgeCombined:      parseFloat(card.querySelector('.mpgeCombined')?.value) || 0,
    l2electricityCost: parseFloat(card.querySelector('.l2electricityCost')?.value) || 0.1855,
    l3electricityCost: parseFloat(card.querySelector('.l3electricityCost')?.value) || 0.4555,
    batterySize:       parseFloat(card.querySelector('.batterySize')?.value) || 0,
    phevElectricPct:   parseFloat(card.querySelector('.phevElectricPct')?.value) || 60,

    // Balloon params
    balloonTerm:     parseInt(card.querySelector('.balloonTerm')?.value) || 60,
    balloonMonthDue: parseInt(card.querySelector('.balloonMonthDue')?.value) || 36,
    balloonAddDown:  getNum(card.querySelector('.balloonAddDown')?.value),
    balloonNewTerm:  parseInt(card.querySelector('.balloonNewTerm')?.value) || 24,
  };
}


// ────────────────────────────────────────────────────────────────
//  CALCULATE ALL VEHICLES
// ────────────────────────────────────────────────────────────────
function calculateAllVehicles() {
  let count = 0;
  vehicles.forEach((entry, id) => {
    try {
      calculateVehicle(entry.card, id);
      count++;
    } catch (err) {
      console.error(`Calc error for vehicle ${id}:`, err);
      showToast(`Error calculating vehicle ${id}`, true);
    }
  });
  showToast(`${count} vehicle(s) calculated`);
}

function calculateVehicle(card, id) {
  const params = gatherParams(card);
  const entry = vehicles.get(id);
  if (!entry) return;

  // ── Run all deal types ──
  const leaseResult = calculateLease(params);
  const financeResult = calculateFinance(params);
  const balloonResult = calculateBalloon(params);

  // Fuel cost
  const fuelResult = calculateFuelCost(params);

  // Deal comparison
  const comparison = compareDeals(leaseResult, financeResult, balloonResult);

  entry.results = { lease: leaseResult, finance: financeResult, balloon: balloonResult, fuel: fuelResult, comparison };

  // ── Populate Results Tab ──
  populateLeaseResults(card, leaseResult, fuelResult);
  populateFinanceResults(card, financeResult);
  populateBalloonResults(card, balloonResult);
  populateDealComparison(card, comparison);
  populateMSDResults(card, leaseResult);
  populateDealAnatomy(card, entry.results);

  // Auto-switch to results tab
  card.querySelectorAll('.vehicle-tab-btn').forEach(b => b.classList.remove('active'));
  card.querySelectorAll('.vehicle-tab-content').forEach(c => c.classList.remove('active'));
  card.querySelector('.vehicle-tab-btn[data-tab="results"]')?.classList.add('active');
  card.querySelector('.vehicle-tab-content[data-tab="results"]')?.classList.add('active');

  // Show relevant breakdown sections
  const dealType = card.querySelector('.dealType')?.value || 'lease';
  card.querySelector('.lease-breakdown-section')?.classList.toggle('hidden', dealType === 'cash');
  card.querySelector('.finance-breakdown-section')?.classList.remove('hidden');
  card.querySelector('.balloon-breakdown-section')?.classList.toggle('hidden', !['balloon', 'balloonfinance'].includes(dealType));
}


// ────────────────────────────────────────────────────────────────
//  POPULATE RESULTS
// ────────────────────────────────────────────────────────────────
function setResult(card, field, value) {
  const el = card.querySelector(`[data-field="${field}"]`);
  if (el) el.textContent = value;
}

function populateLeaseResults(card, r, fuel) {
  // Capitalization
  setResult(card, 'r-msrp', r.formatted.msrp);
  setResult(card, 'r-sellingPrice', r.formatted.sellingPrice);
  setResult(card, 'r-leaseIncentives', `−${fmt(r.leaseIncentives)}`);
  setResult(card, 'r-stateCredit', `−${fmt(r.stateCredit)}`);
  setResult(card, 'r-tradeEquityApplied', `−${r.formatted.tradeApplied}`);
  setResult(card, 'r-downApplied', `−${r.formatted.downApplied}`);
  setResult(card, 'r-cappedFees', `+${r.formatted.cappedFees}`);
  setResult(card, 'r-adjCapCost', r.formatted.adjCapCost);

  // Depreciation
  setResult(card, 'r-residualValue', `${fmt(r.residualValue)} (${fmtPct(r.residualPct)})`);
  setResult(card, 'r-totalDep', fmt(r.adjCapCost - r.residualValue));
  setResult(card, 'r-monthlyDep', r.formatted.monthlyDep);

  // Finance charge
  setResult(card, 'r-moneyFactor', formatMoneyFactor(r.effectiveMF));
  setResult(card, 'r-aprEquiv', r.formatted.aprEquivalent);
  setResult(card, 'r-monthlyRent', r.formatted.monthlyRent);

  // Payment
  setResult(card, 'r-basePayment', r.formatted.basePayment);
  setResult(card, 'r-monthlyTax', r.formatted.monthlyTax);
  setResult(card, 'r-totalMonthly', r.formatted.totalMonthly);

  // Due at signing
  setResult(card, 'r-firstMonth', r.formatted.totalMonthly);
  setResult(card, 'r-driveOffFees', r.formatted.driveOffFees);
  setResult(card, 'r-downCash', r.formatted.downCash);
  setResult(card, 'r-tradeCash', r.formatted.tradeCash);
  setResult(card, 'r-msdDeposit', r.formatted.msdDeposit);
  setResult(card, 'r-upfrontTax', r.formatted.upfrontTax);
  setResult(card, 'r-totalDueAtSigning', r.formatted.totalDueAtSigning);

  // Total spend
  setResult(card, 'r-totalPayments', r.formatted.totalPayments);
  setResult(card, 'r-totalUpfrontPlusPayments', fmt(r.totalDueAtSigning + r.totalPayments));
  setResult(card, 'r-buyout', fmt(r.residualValue + (r.zeroDrive ? 0 : getNum(card.querySelector('.dispFee')?.value))));
  setResult(card, 'r-totalCostToOwn', r.formatted.totalCostToOwn);
  setResult(card, 'r-costPerMile', r.formatted.costPerMile);

  // Fuel
  if (fuel) {
    setResult(card, 'r-monthlyFuel', fmt(fuel.monthlyFuelCost || 0));
    setResult(card, 'r-annualFuel', fmt(fuel.annualFuelCost || 0));
    setResult(card, 'r-totalFuel', fmt((fuel.monthlyFuelCost || 0) * r.term));
    // Also update the input tab fuel display
    if (fuel.fuelType === 'gas') setFieldValue(card, '.annualFuelCost', fmt(fuel.annualFuelCost));
    if (fuel.fuelType === 'ev') {
      setFieldValue(card, '.annualChargingCostL2', fmt(fuel.annualL2Cost || 0));
      setFieldValue(card, '.annualChargingCostL3', fmt(fuel.annualL3Cost || 0));
    }
    if (fuel.fuelType === 'phev') setFieldValue(card, '.annualEnergyCostMixed', fmt(fuel.annualFuelCost || 0));
  }
}

function populateFinanceResults(card, r) {
  setResult(card, 'rf-sellingPrice', r.formatted.sellingPrice);
  setResult(card, 'rf-salesTax', r.formatted.salesTax);
  setResult(card, 'rf-totalVehicleCost', r.formatted.totalVehicleCost);
  setResult(card, 'rf-downPayment', `−${r.formatted.downPayment}`);
  setResult(card, 'rf-tradeEquity', `−${r.formatted.tradeEquity}`);
  setResult(card, 'rf-finIncentives', `−${fmt(r.financeIncentives)}`);
  setResult(card, 'rf-amountFinanced', r.formatted.amountFinanced);
  setResult(card, 'rf-apr', r.formatted.apr);
  setResult(card, 'rf-term', `${r.term} months`);
  setResult(card, 'rf-monthlyPayment', r.formatted.monthlyPayment);
  setResult(card, 'rf-totalPayments', r.formatted.totalPayments);
  setResult(card, 'rf-totalInterest', r.formatted.totalInterest);
  setResult(card, 'rf-totalCost', r.formatted.totalCostToOwn);
  setResult(card, 'rf-costPerMile', r.formatted.costPerMile);
}

function populateBalloonResults(card, r) {
  setResult(card, 'rb-initialPayment', r.formatted.initialPayment);
  setResult(card, 'rb-balloonMonth', `Month ${r.balloonMonthDue}`);
  setResult(card, 'rb-balloonPayment', r.formatted.balloonAmount);
  setResult(card, 'rb-newPayment', r.formatted.newPayment);
  setResult(card, 'rb-newTerm', `${r.balloonNewTerm} months`);
  setResult(card, 'rb-totalCost', r.formatted.totalCost);
}

function populateMSDResults(card, r) {
  const section = card.querySelector('.interest-savings-section');
  if (!section) return;
  if (r.msdActive) {
    section.classList.remove('hidden');
    setResult(card, 'baseMF', formatMoneyFactor(r.baseMF));
    setResult(card, 'appliedDiscounts', `${r.msdCount} MSDs × ${r.msdReduction.toFixed(5)}`);
    setResult(card, 'effectiveMF', formatMoneyFactor(r.effectiveMF));
    setResult(card, 'aprEquiv', fmtPct(r.aprEquivalent));
    setResult(card, 'totalInterestSavings', r.formatted.interestSavings);
  } else {
    section.classList.add('hidden');
  }
}

function populateDealComparison(card, comparison) {
  const grid = card.querySelector('#dealComparisonGrid') || card.querySelector('.deal-comparison-grid');
  if (!grid || !comparison || comparison.deals.length === 0) return;

  grid.innerHTML = comparison.deals.map(deal => {
    const badges = [];
    if (comparison.bestMonthly?.type === deal.type) badges.push('🏆 Best Monthly');
    if (comparison.bestTotal?.type === deal.type) badges.push('🏆 Best Total');
    if (comparison.bestCPM?.type === deal.type) badges.push('🏆 Best CPM');
    if (comparison.bestDriveOff?.type === deal.type) badges.push('🏆 Lowest Drive-Off');

    return `
      <div class="deal-compare-card ${badges.length > 0 ? 'winner' : ''}">
        <h4>${deal.label}</h4>
        ${badges.map(b => `<span class="winner-badge">${b}</span>`).join('')}
        <div class="breakdown-detail"><strong>Monthly</strong><span>${fmt(deal.monthly)}</span></div>
        <div class="breakdown-detail"><strong>Total Cost</strong><span>${fmt(deal.totalCost)}</span></div>
        <div class="breakdown-detail"><strong>Cost/Mile</strong><span>$${deal.costPerMile.toFixed(4)}</span></div>
        <div class="breakdown-detail"><strong>Due at Signing</strong><span>${fmt(deal.dueAtSigning)}</span></div>
      </div>
    `;
  }).join('');
}

function populateDealAnatomy(card, results) {
  const anatomy = card.querySelector('.deal-anatomy');
  if (!anatomy || !results) return;

  const r = results.lease;
  const totalDep = r.adjCapCost - r.residualValue;
  const totalRent = r.monthlyRent * r.term;
  const totalTax = r.monthlyTax * r.term + (r.upfrontTax || 0);
  const total = totalDep + totalRent + totalTax + r.driveOffFees;

  const pctDep  = total > 0 ? ((totalDep / total) * 100).toFixed(1) : 0;
  const pctRent = total > 0 ? ((totalRent / total) * 100).toFixed(1) : 0;
  const pctTax  = total > 0 ? ((totalTax / total) * 100).toFixed(1) : 0;
  const pctFees = total > 0 ? ((r.driveOffFees / total) * 100).toFixed(1) : 0;

  anatomy.innerHTML = `
    <div class="anatomy-bar">
      <div class="anatomy-segment" style="width:${pctDep}%;background:var(--primary);" title="Depreciation: ${pctDep}%"></div>
      <div class="anatomy-segment" style="width:${pctRent}%;background:var(--secondary);" title="Rent Charge: ${pctRent}%"></div>
      <div class="anatomy-segment" style="width:${pctTax}%;background:var(--gold);" title="Tax: ${pctTax}%"></div>
      <div class="anatomy-segment" style="width:${pctFees}%;background:var(--accent);" title="Fees: ${pctFees}%"></div>
    </div>
    <div class="anatomy-legend">
      <span><span class="legend-dot" style="background:var(--primary)"></span> Depreciation ${pctDep}%</span>
      <span><span class="legend-dot" style="background:var(--secondary)"></span> Rent Charge ${pctRent}%</span>
      <span><span class="legend-dot" style="background:var(--gold)"></span> Tax ${pctTax}%</span>
      <span><span class="legend-dot" style="background:var(--accent)"></span> Fees ${pctFees}%</span>
    </div>
  `;
}


// ────────────────────────────────────────────────────────────────
//  CROSS-VEHICLE COMPARISON TABLE
// ────────────────────────────────────────────────────────────────
function toggleComparison() {
  const section = document.getElementById('vComparisonSection');
  section?.classList.toggle('hidden');
  if (!section?.classList.contains('hidden')) {
    buildComparisonTable();
  }
}

function buildComparisonTable() {
  const tbody = document.querySelector('#vComparisonTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const rows = [];

  vehicles.forEach((entry, id) => {
    if (!entry.results) return;
    const card = entry.card;
    const dealType = card.querySelector('.dealType')?.value || 'lease';
    const label = `Vehicle ${id}: ${card.querySelector('.year')?.value || ''} ${card.querySelector('.make')?.value || ''} ${card.querySelector('.model')?.value || ''}`.trim();

    let monthly, totalCost, cpm, dueAtSigning;

    switch (dealType) {
      case 'finance':
        monthly = entry.results.finance.monthlyPayment;
        totalCost = entry.results.finance.totalCostToOwn;
        cpm = entry.results.finance.costPerMile;
        dueAtSigning = entry.results.finance.totalDueAtSigning;
        break;
      case 'balloon':
      case 'balloonfinance':
        monthly = entry.results.balloon.initialPayment;
        totalCost = entry.results.balloon.totalCost;
        cpm = entry.results.balloon.costPerMile;
        dueAtSigning = entry.results.balloon.totalDueAtSigning;
        break;
      default:
        monthly = entry.results.lease.totalMonthly;
        totalCost = entry.results.lease.totalCostToOwn;
        cpm = entry.results.lease.costPerMile;
        dueAtSigning = entry.results.lease.totalDueAtSigning;
    }

    rows.push({ id, label, monthly, totalCost, cpm, dueAtSigning });
  });

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">No calculated vehicles to compare. Click "Calculate All" first.</td></tr>';
    return;
  }

  // Normalize and score
  const mins = {
    monthly:     Math.min(...rows.map(r => r.monthly)),
    totalCost:   Math.min(...rows.map(r => r.totalCost)),
    cpm:         Math.min(...rows.map(r => r.cpm)),
    dueAtSigning:Math.min(...rows.map(r => r.dueAtSigning)),
  };
  const maxes = {
    monthly:     Math.max(...rows.map(r => r.monthly)),
    totalCost:   Math.max(...rows.map(r => r.totalCost)),
    cpm:         Math.max(...rows.map(r => r.cpm)),
    dueAtSigning:Math.max(...rows.map(r => r.dueAtSigning)),
  };

  rows.forEach(row => {
    const norm = (val, min, max) => max > min ? 1 - ((val - min) / (max - min)) : 1;
    row.score = (
      norm(row.monthly, mins.monthly, maxes.monthly)         * currentWeights.monthly +
      norm(row.totalCost, mins.totalCost, maxes.totalCost)   * currentWeights.total +
      norm(row.cpm, mins.cpm, maxes.cpm)                     * currentWeights.cpm +
      norm(row.dueAtSigning, mins.dueAtSigning, maxes.dueAtSigning) * currentWeights.driveoff
    );
  });

  // Sort by score descending
  rows.sort((a, b) => b.score - a.score);
  const best = rows[0];

  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.classList.add('winner-row');
    tr.innerHTML = `
      <td>${row.label} ${i === 0 ? '🏆' : ''}</td>
      <td>${fmt(row.monthly)} ${row.monthly === mins.monthly ? '⭐' : ''}</td>
      <td>${fmt(row.totalCost)} ${row.totalCost === mins.totalCost ? '⭐' : ''}</td>
      <td>$${row.cpm.toFixed(4)} ${row.cpm === mins.cpm ? '⭐' : ''}</td>
      <td>${fmt(row.dueAtSigning)} ${row.dueAtSigning === mins.dueAtSigning ? '⭐' : ''}</td>
      <td>${row.score.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Pairwise comparisons
  buildPairwiseOutput(rows);

  // Trade-in recommendation
  buildTradeRecommendation(rows);
}


// ────────────────────────────────────────────────────────────────
//  PAIRWISE COMPARISON
// ────────────────────────────────────────────────────────────────
function buildPairwiseOutput(rows) {
  const output = document.getElementById('vPairwiseOutput');
  if (!output || rows.length < 2) { output?.classList.add('hidden'); return; }

  let html = '<h3>⚔️ Pairwise Comparisons</h3>';
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const mDiff = b.monthly - a.monthly;
      const tDiff = b.totalCost - a.totalCost;

      html += `
        <div class="pairwise-card">
          <h4>${a.label} vs ${b.label}</h4>
          <p>Monthly difference: <strong>${fmt(Math.abs(mDiff))}</strong> (${mDiff > 0 ? a.label + ' wins' : b.label + ' wins'})</p>
          <p>Total cost difference: <strong>${fmt(Math.abs(tDiff))}</strong> (${tDiff > 0 ? a.label + ' wins' : b.label + ' wins'})</p>
          <p>Score: ${a.score.toFixed(1)} vs ${b.score.toFixed(1)}</p>
        </div>
      `;
    }
  }
  output.innerHTML = html;
  output.classList.remove('hidden');
}


// ────────────────────────────────────────────────────────────────
//  TRADE-IN RECOMMENDATION
// ────────────────────────────────────────────────────────────────
function buildTradeRecommendation(rows) {
  const output = document.getElementById('vComparisonOutput');
  if (!output || rows.length === 0) return;

  const best = rows[0];
  let html = `
    <div class="recommendation">
      <h3>🏆 Recommended: ${best.label}</h3>
      <p>Score: <strong>${best.score.toFixed(1)}/100</strong> | Monthly: <strong>${fmt(best.monthly)}</strong> | Total: <strong>${fmt(best.totalCost)}</strong></p>
    </div>
  `;

  // Trade optimization: if multiple vehicles have trade equity data
  const tradableVehicles = [];
  vehicles.forEach((entry, id) => {
    const card = entry.card;
    const equity = getNum(card.querySelector('.tradeEquity')?.value);
    if (equity !== 0) {
      tradableVehicles.push({
        id,
        label: `Vehicle ${id}`,
        equity,
        monthly: entry.results?.lease?.totalMonthly || 0,
      });
    }
  });

  if (tradableVehicles.length > 0) {
    tradableVehicles.sort((a, b) => b.equity - a.equity);
    const bestTrade = tradableVehicles[0];
    html += `
      <div class="trade-recommendation">
        <h4>🔄 Trade-In Optimization</h4>
        <p>Trade <strong>${bestTrade.label}</strong> first (equity: <strong>${fmt(bestTrade.equity)}</strong>) for maximum cap cost reduction.</p>
      </div>
    `;
  }

  output.innerHTML = html;
}


// ────────────────────────────────────────────────────────────────
//  MATRIX ANALYSIS
// ────────────────────────────────────────────────────────────────
function toggleMatrix() {
  const section = document.getElementById('vMatrixSection');
  section?.classList.toggle('hidden');
  if (!section?.classList.contains('hidden')) {
    populateMatrixVehicleSelect();
    buildMatrix();
  }
}

function populateMatrixVehicleSelect() {
  const sel = document.getElementById('matrixTargetVehicle');
  if (!sel) return;
  sel.innerHTML = '';
  vehicles.forEach((entry, id) => {
    const card = entry.card;
    const label = `Vehicle ${id}: ${card.querySelector('.year')?.value || ''} ${card.querySelector('.make')?.value || ''} ${card.querySelector('.model')?.value || ''}`.trim();
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => buildMatrix());
}

function buildMatrix() {
  const sel = document.getElementById('matrixTargetVehicle');
  const output = document.getElementById('vMatrixOutput');
  if (!sel || !output) return;

  const id = parseInt(sel.value);
  const entry = vehicles.get(id);
  if (!entry) { output.innerHTML = '<p>Select a vehicle first.</p>'; return; }

  const card = entry.card;
  const baseParams = gatherParams(card);

  // Build matrix: vary term and residual
  const terms = [24, 27, 30, 33, 36, 39, 42, 48];
  const residuals = [45, 50, 55, 60, 65, 70];

  let html = '<table class="matrix-table"><thead><tr><th>Term \\ Residual%</th>';
  residuals.forEach(r => html += `<th>${r}%</th>`);
  html += '</tr></thead><tbody>';

  let minPayment = Infinity, maxPayment = 0;
  const cells = [];

  terms.forEach(term => {
    html += `<tr><td><strong>${term}mo</strong></td>`;
    residuals.forEach(res => {
      const p = { ...baseParams, term, residualPct: res };
      const result = calculateLease(p);
      const payment = result.totalMonthly;
      if (payment < minPayment) minPayment = payment;
      if (payment > maxPayment) maxPayment = payment;
      cells.push({ term, res, payment });
      html += `<td class="matrix-cell" data-payment="${payment}">${fmt(payment)}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  output.innerHTML = html;

  // Color-code cells
  const range = maxPayment - minPayment;
  output.querySelectorAll('.matrix-cell').forEach(cell => {
    const payment = parseFloat(cell.dataset.payment);
    if (range > 0) {
      const ratio = (payment - minPayment) / range;
      // Green (low) to Red (high)
      const r = Math.round(ratio * 220);
      const g = Math.round((1 - ratio) * 180);
      cell.style.backgroundColor = `rgba(${r}, ${g}, 50, 0.3)`;
    }
  });
}


// ────────────────────────────────────────────────────────────────
//  EXPORT
// ────────────────────────────────────────────────────────────────
function exportCSV() {
  const rows = [['Vehicle', 'Year', 'Make', 'Model', 'Trim', 'MSRP', 'Selling Price', 'Deal Type',
    'Monthly Payment', 'Due at Signing', 'Total Cost', 'Cost Per Mile', 'Term', 'MF/APR', 'Residual%']];

  vehicles.forEach((entry, id) => {
    const card = entry.card;
    const r = entry.results;
    if (!r) return;

    const dealType = card.querySelector('.dealType')?.value || 'lease';
    let monthly, dueAtSign, totalCost, cpm;

    switch (dealType) {
      case 'finance':
        monthly = r.finance.monthlyPayment; dueAtSign = r.finance.totalDueAtSigning;
        totalCost = r.finance.totalCostToOwn; cpm = r.finance.costPerMile;
        break;
      case 'balloon':
        monthly = r.balloon.initialPayment; dueAtSign = r.balloon.totalDueAtSigning;
        totalCost = r.balloon.totalCost; cpm = r.balloon.costPerMile;
        break;
      default:
        monthly = r.lease.totalMonthly; dueAtSign = r.lease.totalDueAtSigning;
        totalCost = r.lease.totalCostToOwn; cpm = r.lease.costPerMile;
    }

    rows.push([
      `Vehicle ${id}`,
      card.querySelector('.year')?.value || '',
      card.querySelector('.make')?.value || '',
      card.querySelector('.model')?.value || '',
      card.querySelector('.trim')?.value || '',
      card.querySelector('.msrp')?.value || '',
      card.querySelector('.sellingPrice')?.value || '',
      dealType,
      monthly.toFixed(2),
      dueAtSign.toFixed(2),
      totalCost.toFixed(2),
      cpm.toFixed(4),
      card.querySelector('.leaseTerm')?.value || '',
      card.querySelector('.moneyFactor')?.value || card.querySelector('.apr')?.value || '',
      card.querySelector('.residualPct')?.value || '',
    ]);
  });

  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hackulator_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported');
}


// ────────────────────────────────────────────────────────────────
//  THEME TOGGLE
// ────────────────────────────────────────────────────────────────
function toggleTheme() {
  isDark = !isDark;
  document.body.classList.toggle('dark-theme', isDark);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = isDark ? '☀️ Light' : '🌙 Theme';
  showToast(isDark ? 'Dark mode' : 'Light mode');
}
