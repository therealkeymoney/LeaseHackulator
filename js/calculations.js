// ============================================================
//  calculations.js  --  Calculation engine for Lease Hackulator v3
// ============================================================

import { getNum, fmt, fmtPct, formatMoneyFactor } from './utils.js';

// ---- Helper: safe number with default ----------------------

function n(val, fallback = 0) {
  const v = getNum(val);
  return isNaN(v) ? fallback : v;
}

// ---- Helper: PMT formula -----------------------------------

/**
 * Standard PMT (payment) formula for amortizing loans.
 * Returns the fixed monthly payment for a given principal,
 * monthly interest rate, and number of periods.
 * If rate is 0, returns simple principal / periods.
 */
function pmt(principal, monthlyRate, periods) {
  if (periods <= 0) return 0;
  if (principal <= 0) return 0;
  if (monthlyRate <= 0) return principal / periods;
  const factor = Math.pow(1 + monthlyRate, periods);
  return principal * (monthlyRate * factor) / (factor - 1);
}

// ============================================================
//  1. calculateLease
// ============================================================

export function calculateLease(params = {}) {
  // ---- Destructure with defaults ---------------------------
  const msrp            = n(params.msrp);
  const sellingPrice    = n(params.sellingPrice);
  const residualPct     = n(params.residualPct);
  const moneyFactor     = n(params.moneyFactor);
  const term            = n(params.term, 36);
  const annualMiles     = n(params.annualMiles, 10000);

  const downPayment     = n(params.downPayment);
  const downScenario    = params.downScenario || 'capreduction';
  const tradeAllowance  = n(params.tradeAllowance);
  const payoffAmount    = n(params.payoffAmount);
  const tradeScenario   = params.tradeScenario || 'capreduction';

  const leaseIncentives   = n(params.leaseIncentives);
  const financeIncentives = n(params.financeIncentives);
  const stateCredit       = n(params.stateCredit);

  const acqFee    = n(params.acqFee);
  const docFee    = n(params.docFee);
  const regFee    = n(params.regFee);
  const titleFee  = n(params.titleFee);
  const otherFees = n(params.otherFees);

  const capAcquisition = !!(params.capAcquisition);
  const capDealer      = !!(params.capDealer);
  const capReg         = !!(params.capReg);
  const capTitle       = !!(params.capTitle);
  const capOther       = !!(params.capOther);
  const zeroDrive      = !!(params.zeroDrive);

  const taxRate   = n(params.taxRate);
  const taxMethod = params.taxMethod || 'Monthly Payment';

  const msdActive    = !!(params.msdActive);
  const msdCount     = n(params.msdCount);
  const msdReduction = n(params.msdReduction, 0.00001);

  // Fuel fields (passed through for fuel cost calc)
  const fuelType          = params.fuelType || 'gas';
  const avgGasPrice       = n(params.avgGasPrice, 3.50);
  const epaCombinedMpg    = n(params.epaCombinedMpg, 25);
  const mpgeCombined      = n(params.mpgeCombined);
  const l2electricityCost = n(params.l2electricityCost, 0.13);
  const batterySize       = n(params.batterySize);
  const phevElectricPct   = n(params.phevElectricPct, 50);

  // ---- Step 1: Residual value ------------------------------
  const residualValue = msrp * (residualPct / 100);

  // ---- Step 2: Trade equity --------------------------------
  const tradeEquity = tradeAllowance - payoffAmount;

  // ---- Step 3: Down payment per scenario -------------------
  let downApplied = 0; // applied to cap cost reduction
  let downCash = 0;    // cash due at signing (not in cap)

  switch (downScenario) {
    case 'capreduction':
      downApplied = downPayment;
      downCash = 0;
      break;
    case 'split5050':
      downApplied = downPayment / 2;
      downCash = downPayment / 2;
      break;
    case 'atbuyout':
      downApplied = 0;
      downCash = 0; // applied later at buyout, not at signing
      break;
    default:
      downApplied = downPayment;
      downCash = 0;
  }

  // ---- Step 4: Trade equity per scenario -------------------
  let tradeApplied = 0; // applied to cap cost reduction
  let tradeCash = 0;    // net cash back at signing

  if (tradeEquity >= 0) {
    switch (tradeScenario) {
      case 'capreduction':
        tradeApplied = tradeEquity;
        tradeCash = 0;
        break;
      case 'split5050':
        tradeApplied = tradeEquity / 2;
        tradeCash = tradeEquity / 2;
        break;
      case 'atbuyout':
        tradeApplied = 0;
        tradeCash = 0;
        break;
      case 'checkback':
        tradeApplied = 0;
        tradeCash = tradeEquity; // dealer cuts you a check
        break;
      default:
        tradeApplied = tradeEquity;
        tradeCash = 0;
    }
  } else {
    // Negative equity -- added to cap cost
    tradeApplied = tradeEquity; // negative value increases cap
    tradeCash = 0;
  }

  // ---- Step 5: Capped vs. uncapped fees --------------------
  const feeItems = [
    { name: 'Acquisition Fee', amount: acqFee,    capFlag: capAcquisition },
    { name: 'Doc Fee',         amount: docFee,     capFlag: capDealer },
    { name: 'Registration',    amount: regFee,     capFlag: capReg },
    { name: 'Title Fee',       amount: titleFee,   capFlag: capTitle },
    { name: 'Other Fees',      amount: otherFees,  capFlag: capOther },
  ];

  let cappedFees = 0;
  let uncappedFees = 0;

  for (const fee of feeItems) {
    if (fee.amount <= 0) continue;
    const isCapped = fee.capFlag || zeroDrive;
    if (isCapped) {
      cappedFees += fee.amount;
    } else {
      uncappedFees += fee.amount;
    }
  }

  const totalFees = cappedFees + uncappedFees;

  // ---- Step 6: Adjusted Capitalized Cost -------------------
  const grossCapCost = sellingPrice + cappedFees;
  const capReductions = leaseIncentives + stateCredit + downApplied + tradeApplied;
  const adjCapCost = grossCapCost - capReductions;

  // ---- Step 7: MSD adjustment ------------------------------
  const baseMF = moneyFactor;
  let effectiveMF = baseMF;
  if (msdActive && msdCount > 0) {
    effectiveMF = Math.max(0, baseMF - (msdCount * msdReduction));
  }

  // ---- Step 8: Monthly depreciation ------------------------
  const monthlyDep = term > 0 ? (adjCapCost - residualValue) / term : 0;

  // ---- Step 9: Monthly rent charge -------------------------
  const monthlyRent = (adjCapCost + residualValue) * effectiveMF;

  // ---- Step 10: Base payment -------------------------------
  const basePayment = monthlyDep + monthlyRent;

  // ---- Step 11: Tax calculation ----------------------------
  let monthlyTax = 0;
  let upfrontTax = 0;

  const taxRateDecimal = taxRate / 100;

  switch (taxMethod) {
    case 'Monthly Payment':
      monthlyTax = basePayment * taxRateDecimal;
      break;
    case 'Monthly Payment + Fees':
      monthlyTax = (basePayment + (term > 0 ? uncappedFees / term : 0)) * taxRateDecimal;
      break;
    case 'Monthly Depreciation':
      monthlyTax = monthlyDep * taxRateDecimal;
      break;
    case 'Capitalized Cost':
      monthlyTax = term > 0 ? (adjCapCost / term) * taxRateDecimal : 0;
      break;
    case 'Upfront':
      monthlyTax = 0;
      upfrontTax = (basePayment * term) * taxRateDecimal;
      break;
    default:
      monthlyTax = basePayment * taxRateDecimal;
  }

  // ---- Step 12: Total monthly ------------------------------
  const totalMonthly = basePayment + monthlyTax;

  // ---- Step 13: Drive-off fees -----------------------------
  // Uncapped fees that are due at signing (not rolled into cap)
  // If zeroDrive is true, all fees are capped so driveOffFees = 0
  const driveOffFees = zeroDrive ? 0 : uncappedFees;

  // ---- Step 14: MSD deposit --------------------------------
  const msdDeposit = msdActive ? Math.ceil(totalMonthly) * msdCount : 0;

  // ---- Step 15: Total due at signing -----------------------
  const totalDueAtSigning =
    totalMonthly +
    driveOffFees +
    downCash -
    tradeCash +
    msdDeposit +
    upfrontTax;

  // ---- Step 16: Total payments over term -------------------
  const totalPayments = totalMonthly * term;

  // ---- Step 17: Total cost to own (including buyout) -------
  const totalCostToOwn = totalDueAtSigning + totalPayments + residualValue;

  // ---- Step 18: Cost per mile ------------------------------
  const totalMiles = annualMiles * (term / 12);
  const costPerMile = totalMiles > 0 ? totalCostToOwn / totalMiles : 0;

  // ---- Step 19: Interest savings from MSD ------------------
  const interestSavings = msdActive
    ? (baseMF - effectiveMF) * (adjCapCost + residualValue) * term
    : 0;

  // ---- Step 20: APR equivalent -----------------------------
  const aprEquivalent = effectiveMF * 2400;

  // ---- Fuel cost calculation -------------------------------
  const fuel = calculateFuelCost({
    fuelType,
    annualMiles,
    epaCombinedMpg,
    avgGasPrice,
    mpgeCombined,
    l2electricityCost,
    batterySize,
    phevElectricPct,
  });

  // ---- Build result object ---------------------------------
  return {
    // Labels
    type: 'lease',
    label: 'Lease',

    // Input echo
    msrp,
    sellingPrice,
    residualPct,
    term,
    annualMiles,
    moneyFactor: baseMF,
    taxRate,
    taxMethod,

    // Residual
    residualValue,

    // Trade
    tradeAllowance,
    payoffAmount,
    tradeEquity,
    tradeScenario,
    tradeApplied,
    tradeCash,

    // Down
    downPayment,
    downScenario,
    downApplied,
    downCash,

    // Incentives
    leaseIncentives,
    financeIncentives,
    stateCredit,

    // Fees
    acqFee,
    docFee,
    regFee,
    titleFee,
    otherFees,
    totalFees,
    cappedFees,
    uncappedFees,
    driveOffFees,
    zeroDrive,
    feeItems,

    // Cap cost
    grossCapCost,
    capReductions,
    adjCapCost,

    // MSD
    msdActive,
    msdCount,
    msdReduction,
    msdDeposit,
    baseMF,
    effectiveMF,
    interestSavings,

    // Monthly breakdown
    monthlyDep,
    monthlyRent,
    basePayment,
    monthlyTax,
    upfrontTax,
    totalMonthly,

    // Totals
    totalDueAtSigning,
    totalPayments,
    totalCostToOwn,
    totalMiles,
    costPerMile,
    aprEquivalent,

    // Fuel
    fuel,

    // Formatted values for display
    formatted: {
      msrp:              fmt(msrp),
      sellingPrice:      fmt(sellingPrice),
      residualValue:     fmt(residualValue),
      residualPct:       fmtPct(residualPct),
      adjCapCost:        fmt(adjCapCost),
      grossCapCost:      fmt(grossCapCost),
      capReductions:     fmt(capReductions),
      monthlyDep:        fmt(monthlyDep),
      monthlyRent:       fmt(monthlyRent),
      basePayment:       fmt(basePayment),
      monthlyTax:        fmt(monthlyTax),
      upfrontTax:        fmt(upfrontTax),
      totalMonthly:      fmt(totalMonthly),
      totalDueAtSigning: fmt(totalDueAtSigning),
      totalPayments:     fmt(totalPayments),
      totalCostToOwn:    fmt(totalCostToOwn),
      costPerMile:       '$' + costPerMile.toFixed(4),
      msdDeposit:        fmt(msdDeposit),
      interestSavings:   fmt(interestSavings),
      effectiveMF:       formatMoneyFactor(effectiveMF),
      aprEquivalent:     fmtPct(aprEquivalent),
      downApplied:       fmt(downApplied),
      downCash:          fmt(downCash),
      tradeEquity:       fmt(tradeEquity),
      tradeApplied:      fmt(tradeApplied),
      tradeCash:         fmt(tradeCash),
      driveOffFees:      fmt(driveOffFees),
      cappedFees:        fmt(cappedFees),
      uncappedFees:      fmt(uncappedFees),
      totalFees:         fmt(totalFees),
    },
  };
}

// ============================================================
//  2. calculateFinance
// ============================================================

export function calculateFinance(params = {}) {
  const sellingPrice      = n(params.sellingPrice);
  const apr               = n(params.apr);
  const term              = n(params.term, 60);
  const downPayment       = n(params.downPayment);
  const tradeAllowance    = n(params.tradeAllowance);
  const payoffAmount      = n(params.payoffAmount);
  const financeIncentives = n(params.financeIncentives);
  const taxRate           = n(params.taxRate);
  const docFee            = n(params.docFee);
  const regFee            = n(params.regFee);
  const titleFee          = n(params.titleFee);
  const otherFees         = n(params.otherFees);
  const annualMiles       = n(params.annualMiles, 12000);

  // Step 1: Sales tax
  const salesTax = sellingPrice * (taxRate / 100);

  // Step 2: Total vehicle cost
  const totalFees = docFee + regFee + titleFee + otherFees;
  const totalVehicleCost = sellingPrice + salesTax + totalFees;

  // Step 3: Trade equity
  const tradeEquity = tradeAllowance - payoffAmount;

  // Step 4: Amount financed
  const amountFinanced = Math.max(
    0,
    totalVehicleCost - downPayment - tradeEquity - financeIncentives
  );

  // Step 5: Monthly rate and payment
  const monthlyRate = apr / 100 / 12;
  const monthlyPayment = pmt(amountFinanced, monthlyRate, term);

  // Step 6: Total payments
  const totalPayments = monthlyPayment * term;

  // Step 7: Total interest
  const totalInterest = totalPayments - amountFinanced;

  // Step 8: Amortization schedule
  const amortization = [];
  let balance = amountFinanced;

  for (let month = 1; month <= term; month++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    balance = Math.max(0, balance - principalPayment);

    amortization.push({
      month,
      payment:   Math.round(monthlyPayment * 100) / 100,
      principal: Math.round(principalPayment * 100) / 100,
      interest:  Math.round(interestPayment * 100) / 100,
      balance:   Math.round(balance * 100) / 100,
    });
  }

  // Step 9: Total due at signing
  const totalDueAtSigning = downPayment + monthlyPayment;

  // Step 10: Cost per mile
  const totalMiles = annualMiles * (term / 12);
  const totalOutOfPocket = downPayment + totalPayments;
  const costPerMile = totalMiles > 0 ? totalOutOfPocket / totalMiles : 0;

  // Total cost to own
  const totalCostToOwn = totalOutOfPocket;

  return {
    type: 'finance',
    label: 'Finance',

    // Inputs
    sellingPrice,
    apr,
    term,
    annualMiles,
    downPayment,
    tradeAllowance,
    payoffAmount,
    tradeEquity,
    financeIncentives,
    taxRate,

    // Fees
    docFee,
    regFee,
    titleFee,
    otherFees,
    totalFees,

    // Calculations
    salesTax,
    totalVehicleCost,
    amountFinanced,
    monthlyRate,
    monthlyPayment,
    totalPayments,
    totalInterest,
    totalDueAtSigning,
    totalCostToOwn,
    totalMiles,
    costPerMile,

    // Amortization
    amortization,

    // Formatted
    formatted: {
      sellingPrice:      fmt(sellingPrice),
      salesTax:          fmt(salesTax),
      totalVehicleCost:  fmt(totalVehicleCost),
      amountFinanced:    fmt(amountFinanced),
      monthlyPayment:    fmt(monthlyPayment),
      totalPayments:     fmt(totalPayments),
      totalInterest:     fmt(totalInterest),
      totalDueAtSigning: fmt(totalDueAtSigning),
      totalCostToOwn:    fmt(totalCostToOwn),
      costPerMile:       '$' + costPerMile.toFixed(4),
      tradeEquity:       fmt(tradeEquity),
      downPayment:       fmt(downPayment),
      apr:               fmtPct(apr),
      totalFees:         fmt(totalFees),
    },
  };
}

// ============================================================
//  3. calculateBalloon
// ============================================================

export function calculateBalloon(params = {}) {
  // Get a full lease calculation first
  const leaseResult = calculateLease(params);

  const balloonTerm     = n(params.balloonTerm, leaseResult.term);
  const balloonMonthDue = n(params.balloonMonthDue, 24);
  const balloonAddDown  = n(params.balloonAddDown);
  const balloonNewTerm  = n(params.balloonNewTerm, 36);

  // The initial lease payment for months 1 through balloonMonthDue
  const initialPayment = leaseResult.totalMonthly;

  // Step 2: Remaining balance at balloon month
  // In a lease, the cap cost amortizes linearly toward the residual.
  // At month M: remaining = adjCapCost - (monthlyDep * M)
  const adjCapCost    = leaseResult.adjCapCost;
  const monthlyDep    = leaseResult.monthlyDep;
  const residualValue = leaseResult.residualValue;

  const remainingAtBalloon = adjCapCost - (monthlyDep * balloonMonthDue);

  // Step 3: Balloon amount (what you owe at that point)
  const balloonAmount = Math.max(0, remainingAtBalloon);

  // Step 4: Refinance the remaining balance
  // Subtract any additional down payment
  const refinanceAmount = Math.max(0, balloonAmount - balloonAddDown);

  // Use the APR equivalent from the lease, or a provided rate
  const refinanceApr = n(params.balloonApr, leaseResult.aprEquivalent);
  const refinanceMonthlyRate = refinanceApr / 100 / 12;

  // Step 5: New monthly payment
  const newPayment = pmt(refinanceAmount, refinanceMonthlyRate, balloonNewTerm);

  // Total cost calculation
  const initialPhaseTotal = initialPayment * balloonMonthDue;
  const refinancePhaseTotal = newPayment * balloonNewTerm;
  const totalCost =
    leaseResult.totalDueAtSigning +
    initialPhaseTotal +
    balloonAddDown +
    refinancePhaseTotal;

  const totalTerm = balloonMonthDue + balloonNewTerm;
  const annualMiles = leaseResult.annualMiles;
  const totalMiles = annualMiles * (totalTerm / 12);
  const costPerMile = totalMiles > 0 ? totalCost / totalMiles : 0;

  // Amortization for refinance phase
  const amortization = [];
  let balance = refinanceAmount;

  for (let month = 1; month <= balloonNewTerm; month++) {
    const interest = balance * refinanceMonthlyRate;
    const principal = newPayment - interest;
    balance = Math.max(0, balance - principal);

    amortization.push({
      month: balloonMonthDue + month,
      payment:   Math.round(newPayment * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest:  Math.round(interest * 100) / 100,
      balance:   Math.round(balance * 100) / 100,
    });
  }

  return {
    type: 'balloon',
    label: 'Balloon',

    // Phase 1: Initial lease
    initialPayment,
    balloonMonthDue,
    initialPhaseTotal,

    // Balloon
    balloonAmount,
    balloonAddDown,
    remainingAtBalloon,

    // Phase 2: Refinance
    refinanceAmount,
    refinanceApr,
    balloonNewTerm,
    newPayment,
    refinancePhaseTotal,

    // Totals
    totalCost,
    totalTerm,
    totalMiles,
    costPerMile,
    totalDueAtSigning: leaseResult.totalDueAtSigning,

    // Amortization for refinance phase
    amortization,

    // The underlying lease result
    leaseResult,

    // Formatted
    formatted: {
      initialPayment:     fmt(initialPayment),
      balloonAmount:      fmt(balloonAmount),
      newPayment:         fmt(newPayment),
      refinanceAmount:    fmt(refinanceAmount),
      totalCost:          fmt(totalCost),
      costPerMile:        '$' + costPerMile.toFixed(4),
      totalDueAtSigning:  fmt(leaseResult.totalDueAtSigning),
      initialPhaseTotal:  fmt(initialPhaseTotal),
      refinancePhaseTotal: fmt(refinancePhaseTotal),
      balloonAddDown:     fmt(balloonAddDown),
      refinanceApr:       fmtPct(refinanceApr),
    },
  };
}

// ============================================================
//  4. calculateSinglePayLease
// ============================================================

export function calculateSinglePayLease(params = {}) {
  // First calculate the regular lease
  const leaseResult = calculateLease(params);

  const term         = leaseResult.term;
  const totalMonthly = leaseResult.totalMonthly;
  const effectiveMF  = leaseResult.effectiveMF;

  // Discount rate per month derived from the money factor
  // MF approximates a monthly rate; for PV discounting use MF as the discount rate
  const discountRate = effectiveMF > 0 ? effectiveMF : 0;

  // Present value of all monthly payments discounted to month 0
  let singlePayAmount = 0;

  if (discountRate > 0) {
    // Discount each payment back to time 0
    for (let month = 1; month <= term; month++) {
      singlePayAmount += totalMonthly / Math.pow(1 + discountRate, month);
    }
  } else {
    // No discount: just sum of all payments
    singlePayAmount = totalMonthly * term;
  }

  // Add drive-off fees and upfront tax (these are already due at signing)
  const driveOffFees = leaseResult.driveOffFees;
  const upfrontTax   = leaseResult.upfrontTax;

  const totalSinglePay = singlePayAmount + driveOffFees + upfrontTax;

  // Savings vs. paying monthly
  const totalIfMonthly = leaseResult.totalDueAtSigning + leaseResult.totalPayments;
  const savings = totalIfMonthly - totalSinglePay;

  const annualMiles = leaseResult.annualMiles;
  const totalMiles = annualMiles * (term / 12);
  const costPerMile = totalMiles > 0
    ? (totalSinglePay + leaseResult.residualValue) / totalMiles
    : 0;

  return {
    type: 'singlepay',
    label: 'Single-Pay Lease',

    // Core
    singlePayAmount,
    driveOffFees,
    upfrontTax,
    totalSinglePay,

    // Comparison
    totalIfMonthly,
    savings,

    // Per-mile
    totalMiles,
    costPerMile,

    // Underlying lease
    leaseResult,

    // Formatted
    formatted: {
      singlePayAmount: fmt(singlePayAmount),
      totalSinglePay:  fmt(totalSinglePay),
      totalIfMonthly:  fmt(totalIfMonthly),
      savings:         fmt(savings),
      costPerMile:     '$' + costPerMile.toFixed(4),
      driveOffFees:    fmt(driveOffFees),
      upfrontTax:      fmt(upfrontTax),
    },
  };
}

// ============================================================
//  5. calculateFuelCost
// ============================================================

export function calculateFuelCost(params = {}) {
  const fuelType          = params.fuelType || 'gas';
  const annualMiles       = n(params.annualMiles, 12000);
  const epaCombinedMpg    = n(params.epaCombinedMpg, 25);
  const avgGasPrice       = n(params.avgGasPrice, 3.50);
  const fuelTankSize      = n(params.fuelTankSize, 14);
  const mpgeCombined      = n(params.mpgeCombined, 100);
  const l2electricityCost = n(params.l2electricityCost, 0.13);
  const l3electricityCost = n(params.l3electricityCost, 0.40);
  const batterySize       = n(params.batterySize, 60);
  const phevElectricPct   = n(params.phevElectricPct, 50);
  const phevRange         = n(params.phevRange, 30);

  let annualFuelCost = 0;
  let annualChargingCostL2 = 0;
  let annualChargingCostL3 = 0;
  let kWhPer100Mi = 0;
  let rangeGas = 0;
  let rangeElectric = 0;
  let costPerMile = 0;

  // kWh per 100 miles for EVs (EPA uses 33.705 kWh per gallon-equivalent)
  if (mpgeCombined > 0) {
    kWhPer100Mi = 33.705 / mpgeCombined * 100;
  }

  switch (fuelType) {
    case 'gas':
    case 'diesel': {
      // Annual fuel cost = (annualMiles / mpg) * pricePerGallon
      const gallonsPerYear = epaCombinedMpg > 0
        ? annualMiles / epaCombinedMpg
        : 0;
      annualFuelCost = gallonsPerYear * avgGasPrice;
      rangeGas = fuelTankSize * epaCombinedMpg;
      costPerMile = epaCombinedMpg > 0 ? avgGasPrice / epaCombinedMpg : 0;
      break;
    }

    case 'ev': {
      // kWh consumed per year
      const kWhPerYear = mpgeCombined > 0
        ? (annualMiles / 100) * kWhPer100Mi
        : 0;
      annualChargingCostL2 = kWhPerYear * l2electricityCost;
      annualChargingCostL3 = kWhPerYear * l3electricityCost;
      annualFuelCost = annualChargingCostL2; // default to L2
      rangeElectric = batterySize > 0 && kWhPer100Mi > 0
        ? (batterySize / kWhPer100Mi) * 100
        : 0;
      costPerMile = kWhPer100Mi > 0
        ? (kWhPer100Mi / 100) * l2electricityCost
        : 0;
      break;
    }

    case 'phev': {
      // Split miles between electric and gas
      const electricPctDecimal = phevElectricPct / 100;
      const electricMiles = annualMiles * electricPctDecimal;
      const gasMiles = annualMiles * (1 - electricPctDecimal);

      // Electric portion
      const kWhPerYearElectric = kWhPer100Mi > 0
        ? (electricMiles / 100) * kWhPer100Mi
        : 0;
      const electricCost = kWhPerYearElectric * l2electricityCost;

      // Gas portion
      const gallonsForGas = epaCombinedMpg > 0 ? gasMiles / epaCombinedMpg : 0;
      const gasCost = gallonsForGas * avgGasPrice;

      annualFuelCost = electricCost + gasCost;
      annualChargingCostL2 = kWhPerYearElectric * l2electricityCost;
      annualChargingCostL3 = kWhPerYearElectric * l3electricityCost;
      rangeGas = fuelTankSize * epaCombinedMpg;
      rangeElectric = phevRange;
      costPerMile = annualMiles > 0 ? annualFuelCost / annualMiles : 0;
      break;
    }

    case 'hydrogen': {
      // Hydrogen: assume price per kg and kg/100mi
      const hydrogenPrice = n(params.hydrogenPrice, 16);
      const kgPer100Mi = n(params.kgPer100Mi, 1.0);
      const kgPerYear = (annualMiles / 100) * kgPer100Mi;
      annualFuelCost = kgPerYear * hydrogenPrice;
      costPerMile = annualMiles > 0 ? annualFuelCost / annualMiles : 0;
      break;
    }

    default: {
      // Fallback to gas
      const gpy = epaCombinedMpg > 0 ? annualMiles / epaCombinedMpg : 0;
      annualFuelCost = gpy * avgGasPrice;
      costPerMile = epaCombinedMpg > 0 ? avgGasPrice / epaCombinedMpg : 0;
    }
  }

  const monthlyFuelCost = annualFuelCost / 12;

  return {
    fuelType,
    annualMiles,
    annualFuelCost,
    monthlyFuelCost,
    costPerMile,
    annualChargingCostL2,
    annualChargingCostL3,
    kWhPer100Mi,
    rangeGas,
    rangeElectric,

    formatted: {
      annualFuelCost:       fmt(annualFuelCost),
      monthlyFuelCost:      fmt(monthlyFuelCost),
      costPerMile:          '$' + costPerMile.toFixed(4),
      annualChargingCostL2: fmt(annualChargingCostL2),
      annualChargingCostL3: fmt(annualChargingCostL3),
      kWhPer100Mi:          kWhPer100Mi.toFixed(1) + ' kWh',
      rangeGas:             Math.round(rangeGas) + ' mi',
      rangeElectric:        Math.round(rangeElectric) + ' mi',
    },
  };
}

// ============================================================
//  6. compareDeals
// ============================================================

export function compareDeals(leaseResult, financeResult, balloonResult) {
  const deals = [];

  if (leaseResult) {
    deals.push({
      type:           'lease',
      label:          'Lease',
      monthly:        leaseResult.totalMonthly,
      totalCost:      leaseResult.totalCostToOwn,
      costPerMile:    leaseResult.costPerMile,
      dueAtSigning:   leaseResult.totalDueAtSigning,
    });
  }

  if (financeResult) {
    deals.push({
      type:           'finance',
      label:          'Finance',
      monthly:        financeResult.monthlyPayment,
      totalCost:      financeResult.totalCostToOwn,
      costPerMile:    financeResult.costPerMile,
      dueAtSigning:   financeResult.totalDueAtSigning,
    });
  }

  if (balloonResult) {
    deals.push({
      type:           'balloon',
      label:          'Balloon',
      monthly:        balloonResult.initialPayment,
      totalCost:      balloonResult.totalCost,
      costPerMile:    balloonResult.costPerMile,
      dueAtSigning:   balloonResult.totalDueAtSigning,
    });
  }

  if (deals.length === 0) {
    return {
      deals: [],
      bestMonthly: null,
      bestTotal: null,
      bestCPM: null,
      bestDriveOff: null,
      savings: {},
    };
  }

  // Find bests
  const bestMonthly  = [...deals].sort((a, b) => a.monthly - b.monthly)[0];
  const bestTotal    = [...deals].sort((a, b) => a.totalCost - b.totalCost)[0];
  const bestCPM      = [...deals].sort((a, b) => a.costPerMile - b.costPerMile)[0];
  const bestDriveOff = [...deals].sort((a, b) => a.dueAtSigning - b.dueAtSigning)[0];

  // Calculate savings between each pair
  const savings = {};

  for (const deal of deals) {
    savings[deal.type] = {};
    for (const other of deals) {
      if (deal.type === other.type) continue;
      savings[deal.type][other.type] = {
        monthlySavings:    other.monthly - deal.monthly,
        totalSavings:      other.totalCost - deal.totalCost,
        cpmSavings:        other.costPerMile - deal.costPerMile,
        dueAtSigningSavings: other.dueAtSigning - deal.dueAtSigning,
      };
    }
  }

  return {
    deals,

    bestMonthly: {
      type:  bestMonthly.type,
      label: bestMonthly.label,
      value: bestMonthly.monthly,
      formatted: fmt(bestMonthly.monthly),
    },

    bestTotal: {
      type:  bestTotal.type,
      label: bestTotal.label,
      value: bestTotal.totalCost,
      formatted: fmt(bestTotal.totalCost),
    },

    bestCPM: {
      type:  bestCPM.type,
      label: bestCPM.label,
      value: bestCPM.costPerMile,
      formatted: '$' + bestCPM.costPerMile.toFixed(4),
    },

    bestDriveOff: {
      type:  bestDriveOff.type,
      label: bestDriveOff.label,
      value: bestDriveOff.dueAtSigning,
      formatted: fmt(bestDriveOff.dueAtSigning),
    },

    savings,
  };
}
