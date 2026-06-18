// ============================================================
//  housing-calculations.js  --  Calculation engine for Housing Hackulator
//  Mirrors the vehicle lease/finance engine architecture
// ============================================================

import { getNum, fmt, fmtPct } from './utils.js';

// ---- Helper: safe number with default ----------------------

function n(val, fallback = 0) {
  const v = getNum(val);
  return isNaN(v) ? fallback : v;
}

// ---- Helper: PMT formula -----------------------------------

function pmt(principal, monthlyRate, periods) {
  if (periods <= 0) return 0;
  if (principal <= 0) return 0;
  if (monthlyRate <= 0) return principal / periods;
  const factor = Math.pow(1 + monthlyRate, periods);
  return principal * (monthlyRate * factor) / (factor - 1);
}

// ============================================================
//  1. calculateMortgage  (analogous to calculateFinance)
// ============================================================

export function calculateMortgage(params = {}) {
  // ---- Property & Pricing -----------------------------------
  const purchasePrice     = n(params.purchasePrice);
  const appraisedValue    = n(params.appraisedValue, purchasePrice);
  const sellerCredits     = n(params.sellerCredits);
  const closingCostCredit = n(params.closingCostCredit);

  // ---- Down Payment & Equity --------------------------------
  const downPaymentPct    = n(params.downPaymentPct, 20);
  const downPaymentAmt    = n(params.downPaymentAmt, purchasePrice * (downPaymentPct / 100));
  const existingHomeEquity = n(params.existingHomeEquity);

  // ---- Loan Terms -------------------------------------------
  const interestRate  = n(params.interestRate, 7.0);
  const loanTermYears = n(params.loanTermYears, 30);
  const loanType      = params.loanType || 'conventional'; // conventional, fha, va, usda
  const creditTier    = params.creditTier || 'tier1';

  // ---- Property Tax -----------------------------------------
  const assessedValue      = n(params.assessedValue, purchasePrice);
  const assessmentRatio    = n(params.assessmentRatio, 100);
  const millRate           = n(params.millRate, 25);
  const homesteadExemption = n(params.homesteadExemption);
  const otherExemptions    = n(params.otherExemptions);
  const specialAssessments = n(params.specialAssessments);

  // ---- Insurance & HOA --------------------------------------
  const annualInsurance = n(params.annualInsurance, purchasePrice * 0.0035);
  const monthlyHOA      = n(params.monthlyHOA);
  const floodInsurance   = n(params.floodInsurance);

  // ---- PMI fields -------------------------------------------
  const pmiRate        = n(params.pmiRate);
  const pmiEnabled     = params.pmiEnabled !== undefined ? !!(params.pmiEnabled) : (downPaymentPct < 20);
  const upfrontMIP     = n(params.upfrontMIP); // FHA upfront MIP

  // ---- Closing Costs (passed through or calculated) ---------
  const totalClosingCosts = n(params.totalClosingCosts);
  const rollClosingIntoLoan = !!(params.rollClosingIntoLoan);

  // ---- Utilities (monthly) ----------------------------------
  const monthlyElectric = n(params.monthlyElectric);
  const monthlyGas      = n(params.monthlyGas);
  const monthlyWater    = n(params.monthlyWater);
  const monthlySewer    = n(params.monthlySewer);
  const monthlyTrash    = n(params.monthlyTrash);
  const monthlyInternet = n(params.monthlyInternet);
  const otherMonthlyUtilities = n(params.otherMonthlyUtilities);

  // ============================================================
  //  Step 1: Loan Amount
  // ============================================================
  const effectiveDown = downPaymentAmt + existingHomeEquity - sellerCredits;
  let baseLoanAmount = Math.max(0, purchasePrice - effectiveDown);

  // FHA upfront MIP gets rolled into loan
  if (loanType === 'fha' && upfrontMIP > 0) {
    baseLoanAmount += upfrontMIP;
  }

  // Optionally roll closing costs into loan
  if (rollClosingIntoLoan) {
    baseLoanAmount += totalClosingCosts;
  }

  const loanAmount = baseLoanAmount;

  // ============================================================
  //  Step 2: LTV (Loan-to-Value)
  // ============================================================
  const ltvRatio = appraisedValue > 0 ? (loanAmount / appraisedValue) * 100 : 0;

  // ============================================================
  //  Step 3: Monthly Principal & Interest (P&I)
  // ============================================================
  const loanTermMonths = loanTermYears * 12;
  const monthlyRate    = interestRate / 100 / 12;
  const monthlyPI      = pmt(loanAmount, monthlyRate, loanTermMonths);

  // ============================================================
  //  Step 4: Property Tax Calculation
  // ============================================================
  // Taxable assessed value
  const taxableAssessed = Math.max(0,
    (assessedValue * (assessmentRatio / 100)) - homesteadExemption - otherExemptions
  );
  // Annual property tax = (taxableAssessed × millRate / 1000) + special assessments
  const annualPropertyTax = (taxableAssessed * millRate / 1000) + specialAssessments;
  const monthlyPropertyTax = annualPropertyTax / 12;

  // ============================================================
  //  Step 5: Insurance (monthly)
  // ============================================================
  const monthlyInsurance = (annualInsurance + floodInsurance) / 12;

  // ============================================================
  //  Step 6: PMI / MIP Calculation
  // ============================================================
  let monthlyPMI = 0;

  if (pmiEnabled) {
    if (loanType === 'fha') {
      // FHA annual MIP: typically 0.55% for 30yr with >5% down, 0.80% for <5% down
      const fhaMipRate = downPaymentPct < 5 ? 0.80 : 0.55;
      monthlyPMI = (loanAmount * (pmiRate > 0 ? pmiRate : fhaMipRate) / 100) / 12;
    } else if (loanType === 'va') {
      // VA has no monthly PMI, but has upfront funding fee (handled separately)
      monthlyPMI = 0;
    } else if (loanType === 'usda') {
      // USDA annual guarantee fee: 0.35%
      monthlyPMI = (loanAmount * (pmiRate > 0 ? pmiRate : 0.35) / 100) / 12;
    } else {
      // Conventional PMI: rate based on LTV and credit
      const effectivePmiRate = pmiRate > 0 ? pmiRate : estimatePMIRate(ltvRatio, creditTier);
      monthlyPMI = (loanAmount * effectivePmiRate / 100) / 12;
    }
  }

  // Month when PMI drops off (conventional: when LTV reaches 78%)
  let pmiDropOffMonth = 0;
  if (pmiEnabled && loanType === 'conventional') {
    // Find month where remaining balance / appraisedValue <= 0.78
    let bal = loanAmount;
    for (let m = 1; m <= loanTermMonths; m++) {
      const interest = bal * monthlyRate;
      const principal = monthlyPI - interest;
      bal = Math.max(0, bal - principal);
      if (bal / appraisedValue <= 0.78) {
        pmiDropOffMonth = m;
        break;
      }
    }
  }
  // FHA MIP: for terms >15yr with <10% down, MIP is for life of loan
  if (loanType === 'fha' && downPaymentPct >= 10) {
    pmiDropOffMonth = 11 * 12; // 11 years
  }

  // ============================================================
  //  Step 7: Total Monthly Payment (PITI + PMI + HOA)
  // ============================================================
  const monthlyPITI = monthlyPI + monthlyPropertyTax + monthlyInsurance;
  const totalMonthly = monthlyPITI + monthlyPMI + monthlyHOA;

  // ============================================================
  //  Step 8: Utilities total
  // ============================================================
  const totalMonthlyUtilities =
    monthlyElectric + monthlyGas + monthlyWater +
    monthlySewer + monthlyTrash + monthlyInternet + otherMonthlyUtilities;
  const annualUtilities = totalMonthlyUtilities * 12;

  // ============================================================
  //  Step 9: Total monthly housing cost (everything)
  // ============================================================
  const totalMonthlyHousingCost = totalMonthly + totalMonthlyUtilities;

  // ============================================================
  //  Step 10: Cash due at closing
  // ============================================================
  const cashAtClosing = downPaymentAmt +
    (rollClosingIntoLoan ? 0 : totalClosingCosts) -
    sellerCredits - closingCostCredit;

  // ============================================================
  //  Step 11: Amortization Schedule
  // ============================================================
  const amortization = [];
  let balance = loanAmount;
  let totalInterestPaid = 0;
  let totalPMIPaid = 0;
  let yearlySnapshots = [];

  for (let month = 1; month <= loanTermMonths; month++) {
    const interestPayment  = balance * monthlyRate;
    const principalPayment = monthlyPI - interestPayment;
    balance = Math.max(0, balance - principalPayment);

    const pmiThisMonth = (pmiEnabled && (pmiDropOffMonth === 0 || month <= pmiDropOffMonth))
      ? monthlyPMI : 0;

    totalInterestPaid += interestPayment;
    totalPMIPaid += pmiThisMonth;

    amortization.push({
      month,
      payment:   Math.round(monthlyPI * 100) / 100,
      principal: Math.round(principalPayment * 100) / 100,
      interest:  Math.round(interestPayment * 100) / 100,
      pmi:       Math.round(pmiThisMonth * 100) / 100,
      balance:   Math.round(balance * 100) / 100,
      equity:    Math.round((purchasePrice - balance) * 100) / 100,
    });

    // Yearly snapshot
    if (month % 12 === 0) {
      const year = month / 12;
      yearlySnapshots.push({
        year,
        balance:      Math.round(balance * 100) / 100,
        equity:       Math.round((purchasePrice - balance) * 100) / 100,
        totalInterest: Math.round(totalInterestPaid * 100) / 100,
        totalPMI:     Math.round(totalPMIPaid * 100) / 100,
      });
    }
  }

  // ============================================================
  //  Step 12: Totals
  // ============================================================
  const totalPayments   = monthlyPI * loanTermMonths;
  const totalInterest   = totalPayments - loanAmount;
  const totalPropertyTax = annualPropertyTax * loanTermYears;
  const totalInsurance   = (annualInsurance + floodInsurance) * loanTermYears;
  const totalHOA         = monthlyHOA * loanTermMonths;

  const totalCostOfOwnership =
    cashAtClosing + totalPayments + totalPropertyTax +
    totalInsurance + totalHOA + totalPMIPaid +
    (annualUtilities * loanTermYears);

  // ============================================================
  //  Step 13: Debt Ratios (for qualification)
  // ============================================================
  const grossMonthlyIncome = n(params.grossMonthlyIncome, 0);
  const monthlyDebts       = n(params.monthlyDebts, 0);

  const frontEndRatio = grossMonthlyIncome > 0
    ? (totalMonthly / grossMonthlyIncome) * 100 : 0;
  const backEndRatio = grossMonthlyIncome > 0
    ? ((totalMonthly + monthlyDebts) / grossMonthlyIncome) * 100 : 0;

  // Qualification check
  let qualifies = true;
  let qualificationNotes = [];

  if (grossMonthlyIncome > 0) {
    if (loanType === 'conventional' && frontEndRatio > 28) {
      qualifies = false;
      qualificationNotes.push(`Front-end DTI ${frontEndRatio.toFixed(1)}% exceeds 28% guideline`);
    }
    if (loanType === 'conventional' && backEndRatio > 36) {
      qualifies = false;
      qualificationNotes.push(`Back-end DTI ${backEndRatio.toFixed(1)}% exceeds 36% guideline`);
    }
    if (loanType === 'fha' && frontEndRatio > 31) {
      qualificationNotes.push(`Front-end DTI ${frontEndRatio.toFixed(1)}% exceeds FHA 31% guideline`);
    }
    if (loanType === 'fha' && backEndRatio > 43) {
      qualifies = false;
      qualificationNotes.push(`Back-end DTI ${backEndRatio.toFixed(1)}% exceeds FHA 43% guideline`);
    }
    if (loanType === 'va' && backEndRatio > 41) {
      qualificationNotes.push(`Back-end DTI ${backEndRatio.toFixed(1)}% exceeds VA 41% guideline`);
    }
  }

  // ============================================================
  //  Step 14: Tax Benefits (estimated)
  // ============================================================
  const filingStatus = params.filingStatus || 'single';
  const standardDeduction = filingStatus === 'married' ? 29200 : 14600; // 2024 amounts

  // First year interest + property tax (capped at $10k SALT)
  const firstYearInterest = amortization.slice(0, 12)
    .reduce((sum, m) => sum + m.interest, 0);
  const saltDeduction = Math.min(annualPropertyTax, 10000);
  const itemizedTotal = firstYearInterest + saltDeduction;
  const taxBenefit = Math.max(0, itemizedTotal - standardDeduction);
  const estimatedTaxSavings = taxBenefit * n(params.marginalTaxRate, 22) / 100;

  // ============================================================
  //  Build result object
  // ============================================================
  return {
    type: 'mortgage',
    label: 'Mortgage',

    // Input echo
    purchasePrice,
    appraisedValue,
    downPaymentPct,
    downPaymentAmt,
    interestRate,
    loanTermYears,
    loanTermMonths,
    loanType,
    creditTier,

    // Loan
    loanAmount,
    ltvRatio,
    monthlyRate,

    // Monthly breakdown
    monthlyPI,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyPMI,
    monthlyHOA,
    monthlyPITI,
    totalMonthly,
    totalMonthlyUtilities,
    totalMonthlyHousingCost,

    // Property tax detail
    assessedValue,
    assessmentRatio,
    taxableAssessed,
    millRate,
    homesteadExemption,
    otherExemptions,
    specialAssessments,
    annualPropertyTax,

    // Insurance
    annualInsurance,
    floodInsurance,

    // PMI
    pmiEnabled,
    pmiRate: pmiEnabled ? (pmiRate > 0 ? pmiRate : estimatePMIRate(ltvRatio, creditTier)) : 0,
    pmiDropOffMonth,
    totalPMIPaid,

    // Closing
    totalClosingCosts,
    cashAtClosing,
    sellerCredits,
    closingCostCredit,
    rollClosingIntoLoan,

    // Utilities
    monthlyElectric, monthlyGas, monthlyWater,
    monthlySewer, monthlyTrash, monthlyInternet,
    otherMonthlyUtilities, annualUtilities,

    // Totals
    totalPayments,
    totalInterest,
    totalPropertyTax,
    totalInsurance,
    totalHOA,
    totalCostOfOwnership,

    // Qualification
    grossMonthlyIncome,
    monthlyDebts,
    frontEndRatio,
    backEndRatio,
    qualifies,
    qualificationNotes,

    // Tax benefits
    firstYearInterest,
    saltDeduction,
    itemizedTotal,
    estimatedTaxSavings,

    // Amortization
    amortization,
    yearlySnapshots,

    // Formatted values for display
    formatted: {
      purchasePrice:      fmt(purchasePrice),
      appraisedValue:     fmt(appraisedValue),
      downPaymentAmt:     fmt(downPaymentAmt),
      downPaymentPct:     fmtPct(downPaymentPct),
      loanAmount:         fmt(loanAmount),
      ltvRatio:           fmtPct(ltvRatio),
      interestRate:       fmtPct(interestRate),
      monthlyPI:          fmt(monthlyPI),
      monthlyPropertyTax: fmt(monthlyPropertyTax),
      monthlyInsurance:   fmt(monthlyInsurance),
      monthlyPMI:         fmt(monthlyPMI),
      monthlyHOA:         fmt(monthlyHOA),
      monthlyPITI:        fmt(monthlyPITI),
      totalMonthly:       fmt(totalMonthly),
      totalMonthlyHousingCost: fmt(totalMonthlyHousingCost),
      totalMonthlyUtilities: fmt(totalMonthlyUtilities),
      annualPropertyTax:  fmt(annualPropertyTax),
      annualInsurance:    fmt(annualInsurance),
      totalClosingCosts:  fmt(totalClosingCosts),
      cashAtClosing:      fmt(cashAtClosing),
      totalPayments:      fmt(totalPayments),
      totalInterest:      fmt(totalInterest),
      totalCostOfOwnership: fmt(totalCostOfOwnership),
      totalPMIPaid:       fmt(totalPMIPaid),
      frontEndRatio:      fmtPct(frontEndRatio),
      backEndRatio:       fmtPct(backEndRatio),
      estimatedTaxSavings: fmt(estimatedTaxSavings),
      sellerCredits:      fmt(sellerCredits),
      existingHomeEquity: fmt(existingHomeEquity),
    },
  };
}

// ---- PMI Rate estimator (conventional) ----------------------

function estimatePMIRate(ltv, creditTier) {
  // PMI rate table: approximate annual % based on LTV and credit
  // Returns annual PMI rate as a percentage
  const tiers = {
    tier1: { 85: 0.30, 90: 0.50, 95: 0.70, 97: 0.90, 100: 1.10 },
    tier2: { 85: 0.40, 90: 0.65, 95: 0.90, 97: 1.15, 100: 1.40 },
    tier3: { 85: 0.55, 90: 0.85, 95: 1.15, 97: 1.45, 100: 1.75 },
    tier4: { 85: 0.75, 90: 1.10, 95: 1.50, 97: 1.85, 100: 2.20 },
    tier5: { 85: 1.00, 90: 1.40, 95: 1.90, 97: 2.30, 100: 2.75 },
  };

  const table = tiers[creditTier] || tiers.tier2;
  const breakpoints = [85, 90, 95, 97, 100];

  for (const bp of breakpoints) {
    if (ltv <= bp) return table[bp];
  }
  return table[100];
}

// ============================================================
//  2. calculateRentVsBuy  (analogous to calculateLease)
// ============================================================

export function calculateRentVsBuy(params = {}) {
  // Get full mortgage calculation first
  const mortgage = calculateMortgage(params);

  const monthlyRent       = n(params.monthlyRent, 1500);
  const annualRentIncrease = n(params.annualRentIncrease, 3);
  const annualAppreciation = n(params.annualAppreciation, 3);
  const investmentReturn   = n(params.investmentReturn, 7);
  const yearsToCompare     = n(params.yearsToCompare, mortgage.loanTermYears);
  const rentersInsurance   = n(params.rentersInsurance, 150); // monthly
  const maintenancePct     = n(params.maintenancePct, 1); // % of home value annually

  const purchasePrice = mortgage.purchasePrice;
  const downPaymentAmt = mortgage.downPaymentAmt;

  // ---- Rent Side ----
  let totalRentPaid = 0;
  let rentByYear = [];
  let currentRent = monthlyRent;

  for (let year = 1; year <= yearsToCompare; year++) {
    const annualRent = currentRent * 12;
    const annualRentersIns = rentersInsurance * 12;
    totalRentPaid += annualRent + annualRentersIns;
    rentByYear.push({
      year,
      monthlyRent: Math.round(currentRent * 100) / 100,
      annualRent: Math.round(annualRent * 100) / 100,
      cumulativeRent: Math.round(totalRentPaid * 100) / 100,
    });
    currentRent *= (1 + annualRentIncrease / 100);
  }

  // Opportunity cost: down payment invested instead
  const downPaymentInvested = downPaymentAmt *
    Math.pow(1 + investmentReturn / 100, yearsToCompare);
  const investmentGain = downPaymentInvested - downPaymentAmt;

  // Monthly savings (rent - mortgage) invested each month if rent < mortgage
  let monthlySavingsInvested = 0;
  const monthlyInvestReturn = investmentReturn / 100 / 12;
  let currentRentForCalc = monthlyRent;

  for (let month = 1; month <= yearsToCompare * 12; month++) {
    if (month > 1 && month % 12 === 1) {
      currentRentForCalc *= (1 + annualRentIncrease / 100);
    }
    const rentTotal = currentRentForCalc + (rentersInsurance);
    const diff = mortgage.totalMonthlyHousingCost - rentTotal;
    if (diff > 0) {
      // Renting is cheaper this month; invest the savings
      monthlySavingsInvested = (monthlySavingsInvested + diff) * (1 + monthlyInvestReturn);
    }
  }

  const totalRentSideCost = totalRentPaid;
  const totalRentSideWealth = downPaymentInvested + monthlySavingsInvested;

  // ---- Buy Side ----
  const homeValueAtEnd = purchasePrice * Math.pow(1 + annualAppreciation / 100, yearsToCompare);
  const appreciation = homeValueAtEnd - purchasePrice;

  // Total maintenance cost
  let totalMaintenance = 0;
  let currentHomeValue = purchasePrice;
  for (let year = 1; year <= yearsToCompare; year++) {
    totalMaintenance += currentHomeValue * (maintenancePct / 100);
    currentHomeValue *= (1 + annualAppreciation / 100);
  }

  // Equity at end (if within amortization)
  const monthsOwned = Math.min(yearsToCompare * 12, mortgage.loanTermMonths);
  const remainingBalance = monthsOwned < mortgage.amortization.length
    ? mortgage.amortization[monthsOwned - 1].balance
    : 0;

  const equityAtEnd = homeValueAtEnd - remainingBalance;

  // Total buy cost
  const totalBuyPayments = mortgage.totalMonthly * monthsOwned;
  const totalBuyMaintenance = totalMaintenance;
  const totalBuyPropertyTax = mortgage.annualPropertyTax * yearsToCompare;
  const totalBuyUtilities = mortgage.annualUtilities * yearsToCompare;

  const totalBuyCashOutlay = mortgage.cashAtClosing + totalBuyPayments +
    totalBuyMaintenance + totalBuyUtilities;

  // Net cost of buying = total spent - equity gained - tax savings
  const totalTaxSavings = mortgage.estimatedTaxSavings * yearsToCompare;
  const netBuyCost = totalBuyCashOutlay - equityAtEnd - totalTaxSavings;

  // Net cost of renting = total spent - investment wealth
  const netRentCost = totalRentSideCost - totalRentSideWealth + (mortgage.annualUtilities * yearsToCompare * 0.3); // renters pay ~30% of owner utility costs

  // Breakeven: find year where buying becomes cheaper
  let breakevenYear = 0;
  let cumulativeBuyCost = mortgage.cashAtClosing;
  let cumulativeRentCost = 0;
  let rentForBE = monthlyRent;
  let homeValForBE = purchasePrice;
  let balForBE = mortgage.loanAmount;

  for (let year = 1; year <= yearsToCompare; year++) {
    // Buy side annual cost
    cumulativeBuyCost += mortgage.totalMonthly * 12;
    cumulativeBuyCost += homeValForBE * (maintenancePct / 100);
    homeValForBE *= (1 + annualAppreciation / 100);

    // Update balance
    for (let m = 0; m < 12; m++) {
      const monthIdx = ((year - 1) * 12) + m;
      if (monthIdx < mortgage.amortization.length) {
        balForBE = mortgage.amortization[monthIdx].balance;
      }
    }
    const equityNow = homeValForBE - balForBE;

    // Rent side annual cost
    cumulativeRentCost += rentForBE * 12 + rentersInsurance * 12;
    rentForBE *= (1 + annualRentIncrease / 100);

    // Net comparison
    const netBuyNow = cumulativeBuyCost - equityNow;
    if (netBuyNow <= cumulativeRentCost && breakevenYear === 0) {
      breakevenYear = year;
    }
  }

  return {
    type: 'rentvsbuy',
    label: 'Rent vs. Buy',

    // Rent side
    monthlyRent,
    annualRentIncrease,
    totalRentPaid,
    rentByYear,
    rentersInsurance,
    downPaymentInvested,
    investmentGain,
    monthlySavingsInvested,
    totalRentSideCost,
    totalRentSideWealth,
    netRentCost,

    // Buy side
    homeValueAtEnd,
    appreciation,
    equityAtEnd,
    remainingBalance,
    totalBuyCashOutlay,
    totalBuyMaintenance,
    totalTaxSavings,
    netBuyCost,

    // Comparison
    yearsToCompare,
    breakevenYear,
    buyIsBetter: netBuyCost < netRentCost,
    savings: Math.abs(netRentCost - netBuyCost),

    // Underlying mortgage
    mortgage,

    formatted: {
      monthlyRent:        fmt(monthlyRent),
      totalRentPaid:      fmt(totalRentPaid),
      downPaymentInvested: fmt(downPaymentInvested),
      investmentGain:     fmt(investmentGain),
      netRentCost:        fmt(netRentCost),
      homeValueAtEnd:     fmt(homeValueAtEnd),
      appreciation:       fmt(appreciation),
      equityAtEnd:        fmt(equityAtEnd),
      totalBuyCashOutlay: fmt(totalBuyCashOutlay),
      netBuyCost:         fmt(netBuyCost),
      savings:            fmt(Math.abs(netRentCost - netBuyCost)),
      breakevenYear:      breakevenYear > 0 ? `Year ${breakevenYear}` : 'Never (in range)',
      totalTaxSavings:    fmt(totalTaxSavings),
    },
  };
}

// ============================================================
//  2b. calculateLeaseToOwn  (rent-to-own / lease-purchase)
//  Two-stage scenario: lease period → conversion to mortgage
// ============================================================

export function calculateLeaseToOwn(params = {}) {
  // ---- Lease-to-Own Terms -----------------------------------
  const purchasePrice       = n(params.purchasePrice);
  const marketRent          = n(params.marketRent, 1500);
  const rentPremiumPct      = n(params.rentPremiumPct, 10);
  const rentCreditPct       = n(params.rentCreditPct, 20);
  const optionFeePct        = n(params.optionFeePct, 3);
  const optionFeeCreditable = params.optionFeeCreditable !== false; // default true
  const leaseTerm           = n(params.leaseTerm, 36); // months
  const forfeitureRisk      = params.forfeitureRisk !== false; // default true
  const annualAppreciation  = n(params.annualAppreciation, 3);

  // ---- Stage 1: Lease Period --------------------------------

  // Monthly rent = market rent + premium
  const rentPremium       = marketRent * (rentPremiumPct / 100);
  const totalMonthlyRent  = marketRent + rentPremium;

  // Monthly rent credit (amount going toward purchase)
  const monthlyRentCredit = totalMonthlyRent * (rentCreditPct / 100);

  // Upfront option fee
  const optionFee = purchasePrice * (optionFeePct / 100);

  // Accumulate credits over lease period
  const totalRentCredits = monthlyRentCredit * leaseTerm;
  const totalOptionCredit = optionFeeCreditable ? optionFee : 0;
  const totalCreditsAccumulated = totalRentCredits + totalOptionCredit;

  // Total rent paid during lease period
  const totalRentPaid = totalMonthlyRent * leaseTerm;

  // Total cash outlay during lease phase
  const totalLeasePhaseOutlay = optionFee + totalRentPaid;

  // "Wasted" rent (not credited)
  const wastedRent = totalRentPaid - totalRentCredits;

  // Home value at end of lease period (appreciation)
  const leaseYears = leaseTerm / 12;
  const homeValueAtConversion = purchasePrice * Math.pow(1 + annualAppreciation / 100, leaseYears);
  const appreciationDuringLease = homeValueAtConversion - purchasePrice;

  // Instant equity if purchase price is locked
  const instantEquity = homeValueAtConversion - purchasePrice;

  // ---- Stage 2: Conversion to Mortgage ----------------------

  // Effective down payment at conversion
  const effectiveDownPayment = totalCreditsAccumulated;
  const effectiveDownPct = purchasePrice > 0
    ? (effectiveDownPayment / purchasePrice) * 100 : 0;

  // Mortgage principal
  const mortgagePrincipal = Math.max(0, purchasePrice - effectiveDownPayment);

  // Run mortgage calculation for post-conversion
  const mortgageParams = {
    ...params,
    purchasePrice: purchasePrice,
    downPaymentAmt: effectiveDownPayment,
    downPaymentPct: effectiveDownPct,
    appraisedValue: homeValueAtConversion, // appraised at current market
  };
  const postConversionMortgage = calculateMortgage(mortgageParams);

  // ---- Combined Timeline ------------------------------------
  const totalTermMonths = leaseTerm + postConversionMortgage.loanTermMonths;
  const totalTermYears = totalTermMonths / 12;

  // Total cost over full term
  const totalCostFullTerm = totalLeasePhaseOutlay +
    postConversionMortgage.cashAtClosing +
    (postConversionMortgage.totalMonthly * postConversionMortgage.loanTermMonths);

  // Monthly cost timeline
  const timeline = [];

  // Lease phase months
  for (let m = 1; m <= leaseTerm; m++) {
    timeline.push({
      month: m,
      phase: 'lease',
      payment: totalMonthlyRent,
      creditAccumulated: monthlyRentCredit * m + totalOptionCredit,
      equity: 0,
    });
  }

  // Mortgage phase (first 60 months for display)
  const mortgageDisplayMonths = Math.min(60, postConversionMortgage.loanTermMonths);
  for (let m = 1; m <= mortgageDisplayMonths; m++) {
    const amortEntry = postConversionMortgage.amortization[m - 1];
    timeline.push({
      month: leaseTerm + m,
      phase: 'mortgage',
      payment: postConversionMortgage.totalMonthly,
      creditAccumulated: totalCreditsAccumulated,
      equity: amortEntry ? amortEntry.equity : 0,
    });
  }

  // ---- Forfeiture Risk Analysis -----------------------------
  const forfeitedIfWalkAway = optionFee + totalRentCredits; // total lost
  const forfeitureBreakevenMonths = monthlyRentCredit > 0
    ? Math.ceil(optionFee / (totalMonthlyRent - marketRent))
    : 0;

  return {
    type: 'leasetoown',
    label: 'Lease-to-Own',

    // Lease phase
    purchasePrice,
    marketRent,
    rentPremium,
    totalMonthlyRent,
    rentCreditPct,
    monthlyRentCredit,
    optionFee,
    optionFeeCreditable,
    leaseTerm,
    totalRentCredits,
    totalOptionCredit,
    totalCreditsAccumulated,
    totalRentPaid,
    totalLeasePhaseOutlay,
    wastedRent,

    // Appreciation
    annualAppreciation,
    homeValueAtConversion,
    appreciationDuringLease,
    instantEquity,

    // Conversion
    effectiveDownPayment,
    effectiveDownPct,
    mortgagePrincipal,
    postConversionMortgage,

    // Combined
    totalTermMonths,
    totalTermYears,
    totalCostFullTerm,

    // Risk
    forfeitureRisk,
    forfeitedIfWalkAway,
    forfeitureBreakevenMonths,

    // Timeline
    timeline,

    formatted: {
      purchasePrice:          fmt(purchasePrice),
      marketRent:             fmt(marketRent),
      totalMonthlyRent:       fmt(totalMonthlyRent),
      rentPremium:            fmt(rentPremium),
      monthlyRentCredit:      fmt(monthlyRentCredit),
      optionFee:              fmt(optionFee),
      totalRentCredits:       fmt(totalRentCredits),
      totalCreditsAccumulated: fmt(totalCreditsAccumulated),
      totalRentPaid:          fmt(totalRentPaid),
      wastedRent:             fmt(wastedRent),
      effectiveDownPayment:   fmt(effectiveDownPayment),
      effectiveDownPct:       fmtPct(effectiveDownPct),
      mortgagePrincipal:      fmt(mortgagePrincipal),
      homeValueAtConversion:  fmt(homeValueAtConversion),
      appreciationDuringLease: fmt(appreciationDuringLease),
      instantEquity:          fmt(instantEquity),
      totalCostFullTerm:      fmt(totalCostFullTerm),
      forfeitedIfWalkAway:    fmt(forfeitedIfWalkAway),
    },
  };
}

// ============================================================
//  3. calculateARM  (analogous to calculateBalloon)
// ============================================================

export function calculateARM(params = {}) {
  // ---- ARM-specific parameters ------------------------------
  const initialRate       = n(params.initialRate, 6.5);
  const fixedPeriodYears  = n(params.fixedPeriodYears, 5);    // 5/1, 7/1, 10/1
  const adjustmentPeriod  = n(params.adjustmentPeriod, 1);    // years between adjustments
  const initialCap        = n(params.initialCap, 2);          // max first adjustment
  const periodicCap       = n(params.periodicCap, 2);         // max each subsequent adjustment
  const lifetimeCap       = n(params.lifetimeCap, 5);         // max over life from initial
  const margin            = n(params.margin, 2.75);           // margin above index
  const currentIndex      = n(params.currentIndex, 4.5);      // SOFR or similar
  const expectedIndexChange = n(params.expectedIndexChange, 0.25); // annual change assumption

  // Get base mortgage params (use initial rate)
  const mortgageParams = { ...params, interestRate: initialRate };
  const baseMortgage = calculateMortgage(mortgageParams);

  const loanAmount = baseMortgage.loanAmount;
  const loanTermMonths = baseMortgage.loanTermMonths;
  const fixedMonths = fixedPeriodYears * 12;
  const adjustMonths = adjustmentPeriod * 12;

  // Build month-by-month ARM schedule
  const schedule = [];
  let balance = loanAmount;
  let currentRate = initialRate;
  let totalInterestPaid = 0;
  let totalPaymentsMade = 0;
  let indexRate = currentIndex;

  for (let month = 1; month <= loanTermMonths; month++) {
    // Check for rate adjustment
    if (month > fixedMonths && (month - fixedMonths - 1) % adjustMonths === 0) {
      // Calculate new rate: index + margin, subject to caps
      const targetRate = indexRate + margin;
      const maxRate = initialRate + lifetimeCap;
      const minRate = Math.max(margin, 1); // floor

      let newRate;
      if (month === fixedMonths + 1) {
        // First adjustment: apply initial cap
        newRate = Math.min(currentRate + initialCap, targetRate);
        newRate = Math.max(currentRate - initialCap, newRate);
      } else {
        // Subsequent: apply periodic cap
        newRate = Math.min(currentRate + periodicCap, targetRate);
        newRate = Math.max(currentRate - periodicCap, newRate);
      }

      currentRate = Math.min(newRate, maxRate);
      currentRate = Math.max(currentRate, minRate);

      // Simulate index movement
      indexRate += expectedIndexChange;
    }

    const monthlyRate = currentRate / 100 / 12;
    const remainingMonths = loanTermMonths - month + 1;
    const payment = pmt(balance, monthlyRate, remainingMonths);
    const interestPayment = balance * monthlyRate;
    const principalPayment = payment - interestPayment;
    balance = Math.max(0, balance - principalPayment);

    totalInterestPaid += interestPayment;
    totalPaymentsMade += payment;

    schedule.push({
      month,
      rate: Math.round(currentRate * 1000) / 1000,
      payment: Math.round(payment * 100) / 100,
      principal: Math.round(principalPayment * 100) / 100,
      interest: Math.round(interestPayment * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    });
  }

  // Compare to fixed-rate equivalent
  const fixedMortgage = calculateMortgage(params);
  const armSavings = fixedMortgage.totalInterest - totalInterestPaid;

  // Worst-case scenario: rate hits lifetime cap immediately after fixed period
  const worstCaseRate = initialRate + lifetimeCap;
  const worstCaseMonthlyRate = worstCaseRate / 100 / 12;
  const remainingAfterFixed = loanTermMonths - fixedMonths;
  const balanceAtFixedEnd = schedule[fixedMonths - 1]?.balance || loanAmount;
  const worstCasePayment = pmt(balanceAtFixedEnd, worstCaseMonthlyRate, remainingAfterFixed);

  // Best-case: rate stays at initial rate
  const bestCasePayment = baseMortgage.monthlyPI;

  return {
    type: 'arm',
    label: `ARM ${fixedPeriodYears}/1`,

    // ARM specifics
    initialRate,
    fixedPeriodYears,
    adjustmentPeriod,
    initialCap,
    periodicCap,
    lifetimeCap,
    margin,
    currentIndex,
    maxPossibleRate: initialRate + lifetimeCap,

    // Payments
    initialPayment: baseMortgage.monthlyPI,
    totalInterest: totalInterestPaid,
    totalPayments: totalPaymentsMade,

    // Scenarios
    worstCasePayment,
    bestCasePayment,
    worstCaseRate,

    // Comparison to fixed
    fixedMortgage,
    armSavings,

    // Schedule
    schedule,

    // Base mortgage data (taxes, insurance, etc.)
    baseMortgage,

    formatted: {
      initialRate:       fmtPct(initialRate),
      initialPayment:    fmt(baseMortgage.monthlyPI),
      worstCasePayment:  fmt(worstCasePayment),
      bestCasePayment:   fmt(bestCasePayment),
      worstCaseRate:     fmtPct(worstCaseRate),
      maxPossibleRate:   fmtPct(initialRate + lifetimeCap),
      totalInterest:     fmt(totalInterestPaid),
      totalPayments:     fmt(totalPaymentsMade),
      armSavings:        fmt(armSavings),
      balanceAtFixedEnd: fmt(balanceAtFixedEnd),
    },
  };
}

// ============================================================
//  4. calculateRefinance  (analogous to calculateSinglePayLease)
// ============================================================

export function calculateRefinance(params = {}) {
  // Current loan details
  const currentBalance     = n(params.currentBalance);
  const currentRate        = n(params.currentRate);
  const currentTermRemaining = n(params.currentTermRemaining, 300); // months remaining
  const currentMonthlyPI   = n(params.currentMonthlyPI);

  // If no current payment provided, calculate it
  const effectiveCurrentPayment = currentMonthlyPI > 0
    ? currentMonthlyPI
    : pmt(currentBalance, currentRate / 100 / 12, currentTermRemaining);

  // New loan details
  const newRate         = n(params.newRate);
  const newTermYears    = n(params.newTermYears, 30);
  const newTermMonths   = newTermYears * 12;
  const cashOutAmount   = n(params.cashOutAmount);
  const refiClosingCosts = n(params.refiClosingCosts, 3000);
  const rollClosingIntoLoan = !!(params.rollRefiClosingIntoLoan);
  const pointsPurchased  = n(params.pointsPurchased);
  const pointCost        = n(params.pointCost, currentBalance * 0.01); // 1 point = 1% of loan

  // New loan amount
  let newLoanAmount = currentBalance + cashOutAmount;
  if (rollClosingIntoLoan) {
    newLoanAmount += refiClosingCosts;
  }
  newLoanAmount += pointsPurchased * pointCost;

  // New monthly payment
  const newMonthlyRate = newRate / 100 / 12;
  const newMonthlyPI = pmt(newLoanAmount, newMonthlyRate, newTermMonths);

  // Monthly savings
  const monthlySavings = effectiveCurrentPayment - newMonthlyPI;

  // Breakeven months (closing costs / monthly savings)
  const totalRefiCost = refiClosingCosts + (pointsPurchased * pointCost);
  const breakevenMonths = monthlySavings > 0
    ? Math.ceil(totalRefiCost / monthlySavings)
    : 0;

  // Total interest comparison
  const currentTotalInterest = (effectiveCurrentPayment * currentTermRemaining) - currentBalance;
  const newTotalInterest = (newMonthlyPI * newTermMonths) - newLoanAmount;
  const interestSavings = currentTotalInterest - newTotalInterest;

  // Total cost comparison
  const currentTotalCost = effectiveCurrentPayment * currentTermRemaining;
  const newTotalCost = (newMonthlyPI * newTermMonths) + totalRefiCost;
  const totalSavings = currentTotalCost - newTotalCost;

  // Amortization for new loan
  const amortization = [];
  let balance = newLoanAmount;

  for (let month = 1; month <= newTermMonths; month++) {
    const interest = balance * newMonthlyRate;
    const principal = newMonthlyPI - interest;
    balance = Math.max(0, balance - principal);

    amortization.push({
      month,
      payment:   Math.round(newMonthlyPI * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest:  Math.round(interest * 100) / 100,
      balance:   Math.round(balance * 100) / 100,
    });
  }

  return {
    type: 'refinance',
    label: 'Refinance',

    // Current
    currentBalance,
    currentRate,
    currentTermRemaining,
    effectiveCurrentPayment,

    // New
    newLoanAmount,
    newRate,
    newTermYears,
    newTermMonths,
    newMonthlyPI,
    cashOutAmount,

    // Costs
    refiClosingCosts,
    pointsPurchased,
    pointCost,
    totalRefiCost,

    // Savings
    monthlySavings,
    breakevenMonths,
    interestSavings,
    totalSavings,

    // Amortization
    amortization,

    formatted: {
      currentBalance:       fmt(currentBalance),
      currentRate:          fmtPct(currentRate),
      effectiveCurrentPayment: fmt(effectiveCurrentPayment),
      newLoanAmount:        fmt(newLoanAmount),
      newRate:              fmtPct(newRate),
      newMonthlyPI:         fmt(newMonthlyPI),
      monthlySavings:       fmt(monthlySavings),
      breakevenMonths:      breakevenMonths > 0 ? `${breakevenMonths} months` : 'N/A',
      interestSavings:      fmt(interestSavings),
      totalSavings:         fmt(totalSavings),
      totalRefiCost:        fmt(totalRefiCost),
      cashOutAmount:        fmt(cashOutAmount),
    },
  };
}

// ============================================================
//  5. calculatePropertyTax  (analogous to calculateFuelCost)
//  Detailed property tax breakdown
// ============================================================

export function calculatePropertyTax(params = {}) {
  const marketValue        = n(params.marketValue);
  const assessmentRatio    = n(params.assessmentRatio, 100); // % of market value
  const assessedOverride   = n(params.assessedOverride);      // manual assessed value

  // Tax district mill rates (broken out)
  const countyMillRate     = n(params.countyMillRate, 8);
  const municipalMillRate  = n(params.municipalMillRate, 5);
  const schoolMillRate     = n(params.schoolMillRate, 10);
  const specialDistrictRate = n(params.specialDistrictRate, 2);
  const totalMillRate      = countyMillRate + municipalMillRate + schoolMillRate + specialDistrictRate;

  // Exemptions
  const homesteadExemption = n(params.homesteadExemption);
  const seniorExemption    = n(params.seniorExemption);
  const veteranExemption   = n(params.veteranExemption);
  const disabilityExemption = n(params.disabilityExemption);
  const otherExemptions    = n(params.otherExemptions);
  const totalExemptions    = homesteadExemption + seniorExemption + veteranExemption +
                             disabilityExemption + otherExemptions;

  // Special assessments (flat $ amounts)
  const specialAssessments = n(params.specialAssessments);

  // Assessment caps (some states limit annual increase)
  const assessmentCapPct   = n(params.assessmentCapPct); // e.g., 3% max annual increase (CA Prop 13)
  const priorAssessedValue = n(params.priorAssessedValue);
  const yearsOwned         = n(params.yearsOwned, 1);

  // ---- Step 1: Assessed Value --------------------------------
  let assessedValue;
  if (assessedOverride > 0) {
    assessedValue = assessedOverride;
  } else {
    assessedValue = marketValue * (assessmentRatio / 100);
  }

  // Apply assessment cap if applicable
  if (assessmentCapPct > 0 && priorAssessedValue > 0 && yearsOwned > 0) {
    const maxAssessed = priorAssessedValue * Math.pow(1 + assessmentCapPct / 100, yearsOwned);
    assessedValue = Math.min(assessedValue, maxAssessed);
  }

  // ---- Step 2: Taxable Value ---------------------------------
  const taxableValue = Math.max(0, assessedValue - totalExemptions);

  // ---- Step 3: Tax by District --------------------------------
  const countyTax     = taxableValue * countyMillRate / 1000;
  const municipalTax  = taxableValue * municipalMillRate / 1000;
  const schoolTax     = taxableValue * schoolMillRate / 1000;
  const specialTax    = taxableValue * specialDistrictRate / 1000;

  const baseTax       = countyTax + municipalTax + schoolTax + specialTax;
  const totalAnnualTax = baseTax + specialAssessments;
  const monthlyTax    = totalAnnualTax / 12;

  // Effective tax rate (as % of market value)
  const effectiveTaxRate = marketValue > 0 ? (totalAnnualTax / marketValue) * 100 : 0;

  // ---- Step 4: Appeal estimate --------------------------------
  // If assessed value seems high, estimate potential savings
  const appealReduction = n(params.appealReduction, 10); // % reduction if appeal succeeds
  const appealedValue = assessedValue * (1 - appealReduction / 100);
  const appealedTaxable = Math.max(0, appealedValue - totalExemptions);
  const appealedTax = (appealedTaxable * totalMillRate / 1000) + specialAssessments;
  const appealSavings = totalAnnualTax - appealedTax;

  return {
    type: 'propertytax',
    label: 'Property Tax',

    // Values
    marketValue,
    assessmentRatio,
    assessedValue,
    totalExemptions,
    taxableValue,

    // Mill rates
    countyMillRate,
    municipalMillRate,
    schoolMillRate,
    specialDistrictRate,
    totalMillRate,

    // Tax breakdown
    countyTax,
    municipalTax,
    schoolTax,
    specialTax,
    baseTax,
    specialAssessments,
    totalAnnualTax,
    monthlyTax,
    effectiveTaxRate,

    // Exemptions detail
    homesteadExemption,
    seniorExemption,
    veteranExemption,
    disabilityExemption,
    otherExemptions,

    // Assessment cap
    assessmentCapPct,
    priorAssessedValue,

    // Appeal
    appealReduction,
    appealedValue,
    appealedTax,
    appealSavings,

    formatted: {
      marketValue:       fmt(marketValue),
      assessedValue:     fmt(assessedValue),
      taxableValue:      fmt(taxableValue),
      totalExemptions:   fmt(totalExemptions),
      totalMillRate:     totalMillRate.toFixed(3) + ' mills',
      countyTax:         fmt(countyTax),
      municipalTax:      fmt(municipalTax),
      schoolTax:         fmt(schoolTax),
      specialTax:        fmt(specialTax),
      baseTax:           fmt(baseTax),
      specialAssessments: fmt(specialAssessments),
      totalAnnualTax:    fmt(totalAnnualTax),
      monthlyTax:        fmt(monthlyTax),
      effectiveTaxRate:  fmtPct(effectiveTaxRate),
      appealedTax:       fmt(appealedTax),
      appealSavings:     fmt(appealSavings),
    },
  };
}

// ============================================================
//  6. calculateClosingCosts  (detailed closing cost breakdown)
// ============================================================

export function calculateClosingCosts(params = {}) {
  const purchasePrice = n(params.purchasePrice);
  const loanAmount    = n(params.loanAmount);
  const loanType      = params.loanType || 'conventional';
  const state         = params.state || '';

  // ---- Lender Fees -------------------------------------------
  const originationFee   = n(params.originationFee, loanAmount * 0.01);
  const discountPoints   = n(params.discountPoints);
  const applicationFee   = n(params.applicationFee, 400);
  const underwritingFee  = n(params.underwritingFee, 500);
  const processingFee    = n(params.processingFee);
  const creditReportFee  = n(params.creditReportFee, 50);
  const floodCertFee     = n(params.floodCertFee, 20);

  // ---- Third-Party Fees --------------------------------------
  const appraisalFee     = n(params.appraisalFee, 450);
  const inspectionFee    = n(params.inspectionFee, 400);
  const surveyFee        = n(params.surveyFee, 350);
  const titleSearchFee   = n(params.titleSearchFee, 200);
  const titleInsurance   = n(params.titleInsurance, purchasePrice * 0.005);
  const lendersTitleIns  = n(params.lendersTitleIns, loanAmount * 0.0035);
  const attorneyFee      = n(params.attorneyFee, 500);
  const escrowFee        = n(params.escrowFee, 500);
  const notaryFee        = n(params.notaryFee, 150);
  const pestInspection   = n(params.pestInspection);

  // ---- Government Fees ----------------------------------------
  const recordingFee     = n(params.recordingFee, 125);
  const transferTax      = n(params.transferTax, purchasePrice * 0.001);
  const stampDuty        = n(params.stampDuty);

  // ---- Prepaids -----------------------------------------------
  const prepaidInterestDays = n(params.prepaidInterestDays, 15);
  const dailyInterest = loanAmount * (n(params.interestRate, 7) / 100) / 365;
  const prepaidInterest = dailyInterest * prepaidInterestDays;

  const prepaidInsuranceMonths = n(params.prepaidInsuranceMonths, 12);
  const monthlyInsurance = n(params.monthlyInsurance, purchasePrice * 0.0035 / 12);
  const prepaidInsurance = monthlyInsurance * prepaidInsuranceMonths;

  const prepaidTaxMonths = n(params.prepaidTaxMonths, 6);
  const monthlyTax = n(params.monthlyPropertyTax, purchasePrice * 0.01 / 12);
  const prepaidTaxes = monthlyTax * prepaidTaxMonths;

  // ---- Escrow Initial Deposit ---------------------------------
  const escrowInsMonths = n(params.escrowInsMonths, 2);
  const escrowTaxMonths = n(params.escrowTaxMonths, 2);
  const escrowDeposit = (monthlyInsurance * escrowInsMonths) + (monthlyTax * escrowTaxMonths);

  // ---- Loan-Type Specific Fees --------------------------------
  let fhaUpfrontMIP = 0;
  let vaFundingFee = 0;
  let usdaGuaranteeFee = 0;

  if (loanType === 'fha') {
    fhaUpfrontMIP = loanAmount * 0.0175; // 1.75% of loan
  } else if (loanType === 'va') {
    const vaFundingPct = n(params.vaFundingPct, 2.15); // varies by usage and down
    vaFundingFee = loanAmount * (vaFundingPct / 100);
  } else if (loanType === 'usda') {
    usdaGuaranteeFee = loanAmount * 0.01; // 1% upfront
  }

  // ---- Totals ------------------------------------------------
  const lenderFees = originationFee + discountPoints + applicationFee +
    underwritingFee + processingFee + creditReportFee + floodCertFee;

  const thirdPartyFees = appraisalFee + inspectionFee + surveyFee +
    titleSearchFee + titleInsurance + lendersTitleIns + attorneyFee +
    escrowFee + notaryFee + pestInspection;

  const governmentFees = recordingFee + transferTax + stampDuty;

  const prepaids = prepaidInterest + prepaidInsurance + prepaidTaxes;

  const loanTypeFees = fhaUpfrontMIP + vaFundingFee + usdaGuaranteeFee;

  const totalClosingCosts = lenderFees + thirdPartyFees + governmentFees +
    prepaids + escrowDeposit + loanTypeFees;

  const closingCostPct = purchasePrice > 0
    ? (totalClosingCosts / purchasePrice) * 100 : 0;

  return {
    type: 'closingcosts',
    label: 'Closing Costs',

    // Lender
    originationFee, discountPoints, applicationFee,
    underwritingFee, processingFee, creditReportFee, floodCertFee,
    lenderFees,

    // Third party
    appraisalFee, inspectionFee, surveyFee,
    titleSearchFee, titleInsurance, lendersTitleIns,
    attorneyFee, escrowFee, notaryFee, pestInspection,
    thirdPartyFees,

    // Government
    recordingFee, transferTax, stampDuty,
    governmentFees,

    // Prepaids
    prepaidInterest, prepaidInsurance, prepaidTaxes,
    prepaidInterestDays,
    prepaids,

    // Escrow
    escrowDeposit,

    // Loan-type
    fhaUpfrontMIP, vaFundingFee, usdaGuaranteeFee,
    loanTypeFees,

    // Total
    totalClosingCosts,
    closingCostPct,

    formatted: {
      originationFee:    fmt(originationFee),
      discountPoints:    fmt(discountPoints),
      appraisalFee:      fmt(appraisalFee),
      inspectionFee:     fmt(inspectionFee),
      titleInsurance:    fmt(titleInsurance),
      lendersTitleIns:   fmt(lendersTitleIns),
      attorneyFee:       fmt(attorneyFee),
      recordingFee:      fmt(recordingFee),
      transferTax:       fmt(transferTax),
      prepaidInterest:   fmt(prepaidInterest),
      prepaidInsurance:  fmt(prepaidInsurance),
      prepaidTaxes:      fmt(prepaidTaxes),
      escrowDeposit:     fmt(escrowDeposit),
      lenderFees:        fmt(lenderFees),
      thirdPartyFees:    fmt(thirdPartyFees),
      governmentFees:    fmt(governmentFees),
      prepaids:          fmt(prepaids),
      loanTypeFees:      fmt(loanTypeFees),
      totalClosingCosts: fmt(totalClosingCosts),
      closingCostPct:    fmtPct(closingCostPct),
      fhaUpfrontMIP:     fmt(fhaUpfrontMIP),
      vaFundingFee:      fmt(vaFundingFee),
      usdaGuaranteeFee:  fmt(usdaGuaranteeFee),
    },
  };
}

// ============================================================
//  7. compareProperties  (analogous to compareDeals)
//     Full scoring engine + golden rule + dark horse detection
// ============================================================

export function compareProperties(results, weights = null) {
  if (!Array.isArray(results)) results = [...arguments];
  results = results.filter(Boolean);

  const defaultWeights = {
    monthly: 25, totalCost: 20, cashUpfront: 15, dti: 15,
    interestRate: 10, ltv: 5, taxEfficiency: 5, closingCostRatio: 5,
  };
  const w = weights || defaultWeights;

  // ── Normalize deals from mixed result types ──
  const deals = results.map((result, idx) => {
    let monthly = 0, totalCost = 0, cashUpfront = 0, loanAmount = 0;
    let interestRate = 0, ltv = 100, frontDTI = 0, backDTI = 0;
    let purchasePrice = 0, annualTax = 0, totalClosing = 0;
    let totalInterest = 0, equity5yr = 0, appreciation = 0;
    let grossIncome = 0, monthlyPI = 0;
    let label = result.label || `Property ${idx + 1}`;
    const type = result.type;

    if (type === 'mortgage' || type === 'cash') {
      monthly       = result.totalMonthly || 0;
      totalCost     = result.totalCostOfOwnership || 0;
      cashUpfront   = result.cashAtClosing || 0;
      loanAmount    = result.loanAmount || 0;
      interestRate  = result.interestRate || 0;
      ltv           = result.ltvRatio || 0;
      frontDTI      = result.frontEndRatio || 0;
      backDTI       = result.backEndRatio || 0;
      purchasePrice = result.purchasePrice || 0;
      annualTax     = result.annualPropertyTax || 0;
      totalClosing  = result.totalClosingCosts || 0;
      totalInterest = result.totalInterest || 0;
      grossIncome   = result.grossMonthlyIncome || 0;
      monthlyPI     = result.monthlyPI || 0;
      const yr5 = result.yearlySnapshots?.find(y => y.year === 5);
      equity5yr = yr5 ? yr5.equity : 0;
      appreciation = purchasePrice * Math.pow(1.03, 5) - purchasePrice;
    } else if (type === 'arm') {
      const bm = result.baseMortgage || {};
      monthly       = result.initialPayment + (bm.monthlyPropertyTax || 0) +
                      (bm.monthlyInsurance || 0) + (bm.monthlyPMI || 0) + (bm.monthlyHOA || 0);
      totalCost     = (result.totalPayments || 0) + (bm.totalPropertyTax || 0) + (bm.totalInsurance || 0);
      cashUpfront   = bm.cashAtClosing || 0;
      loanAmount    = bm.loanAmount || 0;
      interestRate  = result.initialRate || 0;
      ltv           = bm.ltvRatio || 0;
      frontDTI      = bm.frontEndRatio || 0;
      backDTI       = bm.backEndRatio || 0;
      purchasePrice = bm.purchasePrice || 0;
      annualTax     = bm.annualPropertyTax || 0;
      totalClosing  = bm.totalClosingCosts || 0;
      totalInterest = result.totalInterest || bm.totalInterest || 0;
      grossIncome   = bm.grossMonthlyIncome || 0;
      monthlyPI     = result.initialPayment || 0;
    } else if (type === 'leasetoown') {
      monthly       = result.totalMonthlyRent || 0;
      totalCost     = result.totalCostFullTerm || 0;
      cashUpfront   = result.optionFee || 0;
      purchasePrice = result.purchasePrice || 0;
      interestRate  = result.postConversionMortgage?.interestRate || 0;
    } else if (type === 'rentvsbuy') {
      monthly     = result.monthlyRent || 0;
      totalCost   = result.totalRentSideCost || 0;
    } else if (type === 'refinance') {
      monthly     = result.newMonthlyPI || 0;
      totalCost   = (result.newMonthlyPI || 0) * (result.newTermMonths || 360) + (result.totalRefiCost || 0);
      cashUpfront = result.refiClosingCosts || 0;
      interestRate = result.newRate || 0;
      loanAmount   = result.newLoanAmount || 0;
    } else {
      return null;
    }

    const effectiveTaxRate = purchasePrice > 0 ? (annualTax / purchasePrice) * 100 : 0;
    const closingPct       = purchasePrice > 0 ? (totalClosing / purchasePrice) * 100 : 0;
    const interestMultiple = loanAmount > 0 ? totalInterest / loanAmount : 0;
    const pricePerSqft     = (result.sqft && result.sqft > 0) ? purchasePrice / result.sqft : 0;

    return {
      idx, type, label, result,
      monthly, totalCost, cashUpfront, loanAmount,
      interestRate, ltv, frontDTI, backDTI,
      purchasePrice, annualTax, totalClosing,
      totalInterest, equity5yr, appreciation,
      grossIncome, monthlyPI,
      effectiveTaxRate, closingPct, interestMultiple, pricePerSqft,
      score: 0, rank: 0,
      goldenRules: [], darkHorseFlags: [], badges: [],
    };
  }).filter(Boolean);

  if (deals.length === 0) {
    return { deals: [], winners: {}, goldenRules: [], darkHorse: null, pairwise: [], overallBest: null };
  }

  // ── Scoring: normalize each metric 0-100, lower is better ──
  function normalizeMetric(arr, key) {
    const vals = arr.map(d => d[key]).filter(v => v > 0);
    if (vals.length === 0) return;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    arr.forEach(d => {
      if (d[key] <= 0 && key !== 'interestRate') { d[`_${key}_score`] = 50; return; }
      const raw = (d[key] - min) / range;
      d[`_${key}_score`] = (1 - raw) * 100;
    });
  }

  normalizeMetric(deals, 'monthly');
  normalizeMetric(deals, 'totalCost');
  normalizeMetric(deals, 'cashUpfront');
  normalizeMetric(deals, 'frontDTI');
  normalizeMetric(deals, 'interestRate');
  normalizeMetric(deals, 'ltv');
  normalizeMetric(deals, 'effectiveTaxRate');
  normalizeMetric(deals, 'closingPct');

  // Weighted composite score
  const totalWeight = Object.values(w).reduce((a, b) => a + b, 0);
  deals.forEach(d => {
    d.score = (
      (d._monthly_score || 50)          * w.monthly +
      (d._totalCost_score || 50)        * w.totalCost +
      (d._cashUpfront_score || 50)      * w.cashUpfront +
      (d._frontDTI_score || 50)         * w.dti +
      (d._interestRate_score || 50)     * w.interestRate +
      (d._ltv_score || 50)              * w.ltv +
      (d._effectiveTaxRate_score || 50) * w.taxEfficiency +
      (d._closingPct_score || 50)       * w.closingCostRatio
    ) / totalWeight;
  });

  // Rank
  deals.sort((a, b) => b.score - a.score);
  deals.forEach((d, i) => d.rank = i + 1);

  // ── Category Winners ──
  const bestMonthly  = [...deals].sort((a, b) => a.monthly - b.monthly)[0];
  const bestTotal    = [...deals].sort((a, b) => a.totalCost - b.totalCost)[0];
  const bestCash     = [...deals].sort((a, b) => a.cashUpfront - b.cashUpfront)[0];
  const bestRate     = [...deals].sort((a, b) => a.interestRate - b.interestRate)[0];
  const bestDTI      = [...deals].filter(d => d.frontDTI > 0).sort((a, b) => a.frontDTI - b.frontDTI)[0];
  const bestEquity   = [...deals].sort((a, b) => b.equity5yr - a.equity5yr)[0];

  const winners = {
    overall:  { deal: deals[0], label: 'Best Overall Value' },
    monthly:  { deal: bestMonthly,  label: 'Lowest Monthly Payment' },
    total:    { deal: bestTotal,    label: 'Lowest Lifetime Cost' },
    cash:     { deal: bestCash,     label: 'Lowest Cash at Closing' },
    rate:     { deal: bestRate,     label: 'Best Interest Rate' },
    dti:      bestDTI ? { deal: bestDTI, label: 'Most Comfortable DTI' } : null,
    equity:   bestEquity?.equity5yr > 0 ? { deal: bestEquity, label: 'Best 5-Year Equity Build' } : null,
  };

  // Tag winner badges on deals
  deals.forEach(d => {
    d.badges = [];
    if (d === deals[0]) d.badges.push('🏆 Best Overall');
    if (d === bestMonthly) d.badges.push('💰 Lowest Monthly');
    if (d === bestTotal) d.badges.push('📉 Lowest Total');
    if (d === bestCash) d.badges.push('🏦 Lowest Upfront');
    if (d === bestRate) d.badges.push('📊 Best Rate');
    if (bestDTI && d === bestDTI) d.badges.push('🎯 Best DTI');
    if (bestEquity?.equity5yr > 0 && d === bestEquity) d.badges.push('📈 Best Equity');
  });

  // ── Golden Rule Checks ──
  const goldenRules = [];
  deals.forEach(d => {
    d.goldenRules = [];

    // 28/36 Rule
    if (d.grossIncome > 0) {
      const pass28 = d.frontDTI <= 28;
      const pass36 = d.backDTI <= 36;
      d.goldenRules.push({
        rule: '28/36 Rule',
        pass: pass28 && pass36,
        detail: pass28 && pass36
          ? `Front ${d.frontDTI.toFixed(1)}% / Back ${d.backDTI.toFixed(1)}% — within conventional guidelines`
          : `Front ${d.frontDTI.toFixed(1)}% / Back ${d.backDTI.toFixed(1)}% — ${!pass28 ? 'housing exceeds 28%' : ''} ${!pass36 ? 'total debt exceeds 36%' : ''}`.trim(),
      });
    }

    // 3x Annual Income Rule
    if (d.grossIncome > 0 && d.purchasePrice > 0) {
      const annualIncome = d.grossIncome * 12;
      const ratio = d.purchasePrice / annualIncome;
      const pass = ratio <= 3;
      d.goldenRules.push({
        rule: '3x Income Rule',
        pass,
        detail: `Price is ${ratio.toFixed(1)}x annual income${pass ? ' — within recommended range' : ' — exceeds 3x guideline, stretched budget'}`,
      });
    }

    // 20% Down Rule
    if (d.ltv > 0) {
      const pass = d.ltv <= 80;
      d.goldenRules.push({
        rule: '20% Down Rule',
        pass,
        detail: pass
          ? `LTV ${d.ltv.toFixed(1)}% — no PMI required`
          : `LTV ${d.ltv.toFixed(1)}% — PMI triggered, consider larger down payment`,
      });
    }

    // Emergency Fund Check
    if (d.monthly > 0 && d.cashUpfront > 0) {
      const sixMonths = d.monthly * 6;
      d.goldenRules.push({
        rule: 'Emergency Fund Buffer',
        pass: true,
        detail: `Cash needed: ${fmt(d.cashUpfront)} — ensure ${fmt(sixMonths)} reserves after closing (6 mo. expenses)`,
      });
    }

    // 5-Year Horizon Rule
    if (d.totalClosing > 0 && d.appreciation > 0) {
      const monthlyApprec = d.appreciation / 60;
      const breakeven = monthlyApprec > 0 ? d.totalClosing / monthlyApprec : 999;
      d.goldenRules.push({
        rule: '5-Year Horizon',
        pass: breakeven <= 60,
        detail: breakeven <= 60
          ? `Closing costs recovered in ~${Math.ceil(breakeven)} months — good if staying 5+ years`
          : `May take ${Math.ceil(breakeven)} months to recoup closing — risky for short stays`,
      });
    }

    // 1% Maintenance Rule
    if (d.purchasePrice > 0) {
      const annualMaint = d.purchasePrice * 0.01;
      d.goldenRules.push({
        rule: '1% Maintenance Rule',
        pass: true,
        detail: `Budget ~${fmt(annualMaint)}/yr (${fmt(annualMaint / 12)}/mo) for maintenance`,
      });
    }

    // Interest Reality Check
    if (d.interestMultiple > 0) {
      d.goldenRules.push({
        rule: 'Interest Reality Check',
        pass: d.interestMultiple < 1,
        detail: d.interestMultiple >= 1
          ? `You'll pay ${(d.interestMultiple * 100).toFixed(0)}% of the loan in interest — ${fmt(d.totalInterest)} total`
          : `Interest is ${(d.interestMultiple * 100).toFixed(0)}% of loan — reasonable interest burden`,
      });
    }
  });

  // Aggregate golden rules across all deals
  const ruleNames = [...new Set(deals.flatMap(d => d.goldenRules.map(r => r.rule)))];
  ruleNames.forEach(ruleName => {
    const allPass = deals.every(d => {
      const r = d.goldenRules.find(gr => gr.rule === ruleName);
      return !r || r.pass;
    });
    goldenRules.push({
      rule: ruleName,
      allPass,
      deals: deals.map(d => ({
        label: d.label,
        ...d.goldenRules.find(gr => gr.rule === ruleName),
      })).filter(d => d.rule),
    });
  });

  // ── Dark Horse Identifier ──
  let darkHorse = null;
  if (deals.length >= 2) {
    const nonWinners = deals.filter(d => d.rank > 1);
    for (const d of nonWinners) {
      const flags = [];

      if (d === bestTotal && d !== bestMonthly) {
        flags.push('Lowest lifetime cost despite higher monthly — long-game winner');
      }
      if (bestEquity?.equity5yr > 0 && d === bestEquity && d !== deals[0]) {
        flags.push('Builds equity fastest — best wealth accumulation path');
      }
      if (bestDTI && d === bestDTI && d !== deals[0]) {
        flags.push('Most comfortable on your budget — lowest financial stress');
      }
      const avgTaxRate = deals.reduce((s, x) => s + x.effectiveTaxRate, 0) / deals.length;
      if (d.effectiveTaxRate > 0 && d.effectiveTaxRate < avgTaxRate * 0.7) {
        flags.push(`Tax rate ${d.effectiveTaxRate.toFixed(2)}% is ${((1 - d.effectiveTaxRate / avgTaxRate) * 100).toFixed(0)}% below average — long-term savings`);
      }
      const avgClosing = deals.reduce((s, x) => s + x.closingPct, 0) / deals.length;
      if (d.closingPct > 0 && d.closingPct < avgClosing * 0.7) {
        flags.push(`Closing costs ${d.closingPct.toFixed(1)}% vs ${avgClosing.toFixed(1)}% avg — lower barrier to entry`);
      }
      if (d.score >= deals[0].score * 0.9 && d.rank > 1) {
        flags.push(`Scored within ${((1 - d.score / deals[0].score) * 100).toFixed(0)}% of the winner — nearly equivalent value`);
      }

      if (flags.length > 0) {
        d.darkHorseFlags = flags;
        if (!darkHorse || flags.length > darkHorse.flags.length) {
          darkHorse = { deal: d, flags };
        }
      }
    }
  }

  // ── Pairwise Comparison Matrix ──
  const pairwise = [];
  for (let i = 0; i < deals.length; i++) {
    for (let j = i + 1; j < deals.length; j++) {
      const a = deals[i], b = deals[j];
      const monthlySav  = b.monthly - a.monthly;
      const totalSav    = b.totalCost - a.totalCost;
      const cashSav     = b.cashUpfront - a.cashUpfront;
      const scoreDiff   = a.score - b.score;

      pairwise.push({
        a: a.label, b: b.label,
        aIdx: a.idx, bIdx: b.idx,
        winner: scoreDiff >= 0 ? a.label : b.label,
        monthlySavings: Math.abs(monthlySav),
        monthlyFavor: monthlySav >= 0 ? a.label : b.label,
        totalSavings: Math.abs(totalSav),
        totalFavor: totalSav >= 0 ? a.label : b.label,
        cashSavings: Math.abs(cashSav),
        cashFavor: cashSav >= 0 ? a.label : b.label,
        scoreDiff: Math.abs(scoreDiff).toFixed(1),
      });
    }
  }

  return {
    deals,
    winners,
    goldenRules,
    darkHorse,
    pairwise,
    overallBest: deals[0] || null,
  };
}

// ============================================================
//  8. crossDomainComparison  (Housing x Vehicle)
//     Pairs each property with vehicle options for total picture
// ============================================================

export function crossDomainComparison(housingResults, vehicleResults, grossMonthlyIncome = 0) {
  const pairings = [];

  for (const h of housingResults) {
    if (!h) continue;
    const hMonthly = h.type === 'mortgage' ? (h.totalMonthly || 0) :
                     h.type === 'arm' ? ((h.initialPayment || 0) + (h.baseMortgage?.monthlyPropertyTax || 0) +
                       (h.baseMortgage?.monthlyInsurance || 0)) :
                     h.type === 'leasetoown' ? (h.totalMonthlyRent || 0) :
                     h.type === 'refinance' ? (h.newMonthlyPI || 0) : 0;
    const hLabel = h.label || 'Property';
    const hCash  = h.cashAtClosing || h.optionFee || h.refiClosingCosts || 0;

    for (const v of vehicleResults) {
      if (!v) continue;
      const vMonthly = v.monthlyPayment || v.totalMonthlyPayment || 0;
      const vLabel   = v.label || 'Vehicle';
      const vCash    = v.dueAtSigning || v.totalDriveOff || v.downPayment || 0;

      const combinedMonthly = hMonthly + vMonthly;
      const combinedCash    = hCash + vCash;
      const combinedDTI     = grossMonthlyIncome > 0 ? (combinedMonthly / grossMonthlyIncome) * 100 : 0;

      let healthGrade, healthClass;
      if (combinedDTI <= 36) { healthGrade = 'A'; healthClass = 'grade-a'; }
      else if (combinedDTI <= 43) { healthGrade = 'B'; healthClass = 'grade-b'; }
      else if (combinedDTI <= 50) { healthGrade = 'C'; healthClass = 'grade-c'; }
      else if (combinedDTI <= 60) { healthGrade = 'D'; healthClass = 'grade-d'; }
      else { healthGrade = 'F'; healthClass = 'grade-f'; }

      const warnings = [];
      if (combinedDTI > 50) warnings.push('Combined DTI exceeds 50% — high financial stress');
      if (combinedDTI > 43) warnings.push('Combined DTI exceeds FHA max guidelines');
      if (combinedMonthly > grossMonthlyIncome * 0.5) warnings.push('Over half of gross income committed');

      pairings.push({
        housingLabel: hLabel, vehicleLabel: vLabel,
        housingMonthly: hMonthly, vehicleMonthly: vMonthly,
        combinedMonthly, combinedCash, combinedDTI,
        healthGrade, healthClass, warnings,
        housingResult: h, vehicleResult: v,
      });
    }
  }

  pairings.sort((a, b) => a.combinedDTI - b.combinedDTI || a.combinedMonthly - b.combinedMonthly);
  if (pairings.length > 0) pairings[0].isBestPairing = true;

  const bestHousing = pairings.length > 0
    ? pairings.reduce((best, p) => p.housingMonthly < best.housingMonthly ? p : best, pairings[0])
    : null;
  const bestVehicle = pairings.length > 0
    ? pairings.reduce((best, p) => p.vehicleMonthly < best.vehicleMonthly ? p : best, pairings[0])
    : null;

  return {
    pairings,
    bestPairing: pairings[0] || null,
    bestHousing: bestHousing ? { label: bestHousing.housingLabel, monthly: bestHousing.housingMonthly } : null,
    bestVehicle: bestVehicle ? { label: bestVehicle.vehicleLabel, monthly: bestVehicle.vehicleMonthly } : null,
    totalPairings: pairings.length,
  };
}

// ============================================================
//  9. sensitivityMatrix  (Rate vs Price payment grid)
// ============================================================

export function sensitivityMatrix(params = {}) {
  const basePrice = n(params.purchasePrice, 300000);
  const baseRate  = n(params.interestRate, 7);
  const downPct   = n(params.downPaymentPct, 20);
  const termYears = n(params.loanTermYears, 30);
  const periods   = termYears * 12;

  // Generate price steps: -10% to +10% in 5% increments
  const priceSteps = [-10, -5, 0, 5, 10].map(pct => ({
    pct,
    price: Math.round(basePrice * (1 + pct / 100)),
  }));

  // Generate rate steps: -1.5% to +1.5% in 0.5% increments
  const rateSteps = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5].map(delta => ({
    delta,
    rate: Math.max(0.5, baseRate + delta),
  }));

  const grid = [];
  for (const ps of priceSteps) {
    const row = { price: ps.price, pricePct: ps.pct, cells: [] };
    for (const rs of rateSteps) {
      const loan = ps.price * (1 - downPct / 100);
      const mr = rs.rate / 100 / 12;
      const payment = pmt(loan, mr, periods);
      const isBase = ps.pct === 0 && rs.delta === 0;
      row.cells.push({
        rate: rs.rate,
        rateDelta: rs.delta,
        payment,
        isBase,
        formatted: fmt(payment),
      });
    }
    grid.push(row);
  }

  // Base payment for delta calculations
  const baseLoan = basePrice * (1 - downPct / 100);
  const baseMR = baseRate / 100 / 12;
  const basePayment = pmt(baseLoan, baseMR, periods);

  return {
    grid,
    rateSteps: rateSteps.map(r => r.rate),
    priceSteps: priceSteps.map(p => p.price),
    basePayment,
    basePrice,
    baseRate,
  };
}

// ============================================================
//  10. affordabilityCeiling  (Reverse calc from income)
// ============================================================

export function affordabilityCeiling(params = {}) {
  const grossMonthly    = n(params.grossMonthlyIncome);
  const monthlyDebts    = n(params.monthlyDebts);
  const interestRate    = n(params.interestRate, 7);
  const termYears       = n(params.loanTermYears, 30);
  const downPct         = n(params.downPaymentPct, 20);
  const annualTaxRate   = n(params.effectiveTaxRate, 0.47); // % of price
  const annualInsRate   = n(params.annualInsurancePct, 0.59); // % of price
  const monthlyHOA      = n(params.monthlyHOA);

  if (grossMonthly <= 0) return null;

  const periods = termYears * 12;
  const mr = interestRate / 100 / 12;

  // Calculate max housing payment at different DTI thresholds
  const thresholds = [
    { name: 'Conservative (25%)', frontMax: 0.25, backMax: 0.33 },
    { name: 'Conventional (28/36)', frontMax: 0.28, backMax: 0.36 },
    { name: 'FHA Max (31/43)', frontMax: 0.31, backMax: 0.43 },
    { name: 'Stretch (35/50)', frontMax: 0.35, backMax: 0.50 },
  ];

  const results = thresholds.map(t => {
    // Front-end: housing only
    const maxHousingFront = grossMonthly * t.frontMax;
    // Back-end: all debts
    const maxHousingBack = grossMonthly * t.backMax - monthlyDebts;
    // Binding constraint is the lower of the two
    const maxHousing = Math.min(maxHousingFront, maxHousingBack);

    // Subtract tax, insurance, HOA to get max P&I
    // Tax + insurance are functions of price, so we solve iteratively
    // maxHousing = PI + (price * taxRate/12/100) + (price * insRate/12/100) + HOA
    // maxHousing - HOA = PI + price * (taxRate + insRate) / 1200
    // PI = pmt(price * (1-downPct/100), mr, periods)
    // We need to solve for price. Use iteration.
    let lo = 0, hi = 2000000;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const loan = mid * (1 - downPct / 100);
      const pi = pmt(loan, mr, periods);
      const taxIns = mid * (annualTaxRate + annualInsRate) / 1200;
      const total = pi + taxIns + monthlyHOA;
      if (total < maxHousing) lo = mid;
      else hi = mid;
    }
    const maxPrice = Math.round((lo + hi) / 2);
    const maxLoan = Math.round(maxPrice * (1 - downPct / 100));
    const maxPI = pmt(maxLoan, mr, periods);
    const downPayment = maxPrice - maxLoan;

    return {
      threshold: t.name,
      frontMax: t.frontMax * 100,
      backMax: t.backMax * 100,
      maxPrice,
      maxLoan,
      maxPI,
      maxHousingPayment: Math.round(maxHousing),
      downPayment,
      formatted: {
        maxPrice: fmt(maxPrice),
        maxLoan: fmt(maxLoan),
        maxPI: fmt(maxPI),
        maxHousing: fmt(Math.round(maxHousing)),
        downPayment: fmt(downPayment),
      },
    };
  });

  return { thresholds: results, grossMonthly, monthlyDebts, interestRate, downPct };
}

// ============================================================
//  11. costOfWaiting  (Impact of delaying purchase)
// ============================================================

export function costOfWaiting(params = {}) {
  const purchasePrice     = n(params.purchasePrice, 340000);
  const interestRate      = n(params.interestRate, 7);
  const downPct           = n(params.downPaymentPct, 20);
  const termYears         = n(params.loanTermYears, 30);
  const annualAppreciation = n(params.annualAppreciation, 3);
  const annualRateChange  = n(params.annualRateChange, 0.25); // projected rate increase per year
  const monthlyRent       = n(params.currentRent, 1500);

  const periods = termYears * 12;
  const scenarios = [
    { months: 3, label: '3 Months' },
    { months: 6, label: '6 Months' },
    { months: 12, label: '1 Year' },
    { months: 24, label: '2 Years' },
  ];

  // Current scenario
  const nowLoan = purchasePrice * (1 - downPct / 100);
  const nowMR = interestRate / 100 / 12;
  const nowPayment = pmt(nowLoan, nowMR, periods);
  const nowTotalInterest = nowPayment * periods - nowLoan;

  const results = scenarios.map(s => {
    const monthlyApprecRate = Math.pow(1 + annualAppreciation / 100, 1 / 12) - 1;
    const futurePrice = purchasePrice * Math.pow(1 + monthlyApprecRate, s.months);
    const futureRate = interestRate + (annualRateChange * s.months / 12);
    const futureLoan = futurePrice * (1 - downPct / 100);
    const futureMR = futureRate / 100 / 12;
    const futurePayment = pmt(futureLoan, futureMR, periods);
    const futureTotalInterest = futurePayment * periods - futureLoan;

    const priceIncrease = futurePrice - purchasePrice;
    const paymentIncrease = futurePayment - nowPayment;
    const interestIncrease = futureTotalInterest - nowTotalInterest;
    const rentPaid = monthlyRent * s.months;
    const totalCostOfWaiting = interestIncrease + priceIncrease + rentPaid;
    const downPaymentIncrease = (futurePrice - purchasePrice) * (downPct / 100);

    return {
      ...s,
      futurePrice: Math.round(futurePrice),
      futureRate: Math.round(futureRate * 1000) / 1000,
      futurePayment: Math.round(futurePayment * 100) / 100,
      priceIncrease: Math.round(priceIncrease),
      paymentIncrease: Math.round(paymentIncrease * 100) / 100,
      interestIncrease: Math.round(interestIncrease),
      rentPaid,
      totalCostOfWaiting: Math.round(totalCostOfWaiting),
      downPaymentIncrease: Math.round(downPaymentIncrease),
      formatted: {
        futurePrice: fmt(Math.round(futurePrice)),
        futureRate: futureRate.toFixed(3) + '%',
        futurePayment: fmt(Math.round(futurePayment * 100) / 100),
        priceIncrease: fmt(Math.round(priceIncrease)),
        paymentIncrease: fmt(Math.round(paymentIncrease * 100) / 100),
        interestIncrease: fmt(Math.round(interestIncrease)),
        rentPaid: fmt(rentPaid),
        totalCost: fmt(Math.round(totalCostOfWaiting)),
        downPaymentIncrease: fmt(Math.round(downPaymentIncrease)),
      },
    };
  });

  return {
    scenarios: results,
    nowPayment,
    nowPrice: purchasePrice,
    nowRate: interestRate,
    formatted: { nowPayment: fmt(nowPayment) },
  };
}

// ============================================================
//  12. offerStrategy  (Suggest offer range based on market data)
// ============================================================

export function offerStrategy(params = {}) {
  const listPrice      = n(params.listPrice);
  const daysOnMarket   = n(params.daysOnMarket);
  const condition       = params.condition || 'good';
  const propertyType    = params.propertyType || 'single_family';
  const appraisedValue = n(params.appraisedValue, listPrice);
  const sellerCredits  = n(params.sellerCredits);

  if (listPrice <= 0) return null;

  // DOM (Days on Market) leverage
  let domSignal, domDiscount;
  if (daysOnMarket <= 7) {
    domSignal = { level: 'hot', label: 'Hot Market', arrow: 'up', note: 'New listing — expect competition, offer at or above ask' };
    domDiscount = 0;
  } else if (daysOnMarket <= 21) {
    domSignal = { level: 'warm', label: 'Active', arrow: 'flat', note: 'Still fresh — modest negotiation room' };
    domDiscount = 1.5;
  } else if (daysOnMarket <= 45) {
    domSignal = { level: 'cooling', label: 'Cooling', arrow: 'down', note: 'Getting stale — leverage for 3-5% below ask' };
    domDiscount = 3.5;
  } else if (daysOnMarket <= 90) {
    domSignal = { level: 'cold', label: 'Stale Listing', arrow: 'down', note: 'Seller likely motivated — push for 5-8% below' };
    domDiscount = 6;
  } else {
    domSignal = { level: 'frozen', label: 'Aged Inventory', arrow: 'down', note: 'Major leverage — 8-12% below or creative terms' };
    domDiscount = 10;
  }

  // Condition adjustment
  let conditionAdj = 0;
  const condSignals = [];
  if (condition === 'fixer') {
    conditionAdj = 8;
    condSignals.push({ label: 'Fixer-Upper', arrow: 'down', note: 'Factor rehab costs — negotiate 8-15% below for renovation budget' });
  } else if (condition === 'fair') {
    conditionAdj = 3;
    condSignals.push({ label: 'Fair Condition', arrow: 'down', note: 'Deferred maintenance = negotiation leverage' });
  } else if (condition === 'excellent' || condition === 'new') {
    conditionAdj = -1;
    condSignals.push({ label: condition === 'new' ? 'New Build' : 'Excellent', arrow: 'up', note: 'Premium condition — less room to negotiate on price' });
  }

  // Appraisal gap
  let appraisalSignal = null;
  if (appraisedValue > 0 && appraisedValue < listPrice) {
    const gap = listPrice - appraisedValue;
    const gapPct = (gap / listPrice * 100).toFixed(1);
    appraisalSignal = {
      label: 'Appraisal Gap',
      arrow: 'down',
      note: `Appraised ${fmt(gap)} below list (${gapPct}%) — strong leverage to negotiate down`,
      gap, gapPct,
    };
  } else if (appraisedValue > listPrice) {
    const equity = appraisedValue - listPrice;
    appraisalSignal = {
      label: 'Instant Equity',
      arrow: 'up',
      note: `Appraised ${fmt(equity)} above list — built-in equity from day one`,
      gap: -equity,
    };
  }

  // Calculate offer range
  const maxDiscount = Math.min(domDiscount + conditionAdj, 15);
  const minDiscount = Math.max(0, domDiscount + conditionAdj - 3);
  const aggressiveOffer = Math.round(listPrice * (1 - maxDiscount / 100));
  const moderateOffer   = Math.round(listPrice * (1 - (minDiscount + maxDiscount) / 200));
  const conservativeOffer = Math.round(listPrice * (1 - minDiscount / 100));

  const signals = [domSignal, ...condSignals];
  if (appraisalSignal) signals.push(appraisalSignal);

  return {
    listPrice,
    offers: {
      aggressive:  { price: aggressiveOffer,   discount: maxDiscount,   label: 'Aggressive' },
      moderate:    { price: moderateOffer,      discount: (minDiscount + maxDiscount) / 2, label: 'Moderate' },
      conservative: { price: conservativeOffer, discount: minDiscount,   label: 'Conservative' },
    },
    signals,
    daysOnMarket,
    condition,
    sellerCredits,
    formatted: {
      aggressive: fmt(aggressiveOffer),
      moderate: fmt(moderateOffer),
      conservative: fmt(conservativeOffer),
    },
  };
}

// ============================================================
//  13. stressTest  (Rate shock, income drop, job loss)
// ============================================================

export function stressTest(params = {}) {
  const monthlyPI        = n(params.monthlyPI);
  const totalMonthly     = n(params.totalMonthly);
  const grossMonthly     = n(params.grossMonthlyIncome);
  const loanAmount       = n(params.loanAmount);
  const interestRate     = n(params.interestRate, 7);
  const termYears        = n(params.loanTermYears, 30);
  const cashReserves     = n(params.cashReserves);
  const monthlyDebts     = n(params.monthlyDebts);

  const periods = termYears * 12;
  const results = [];

  // Rate shock scenarios
  const rateShocks = [1, 2, 3];
  rateShocks.forEach(bump => {
    const newRate = interestRate + bump;
    const newMR = newRate / 100 / 12;
    const newPI = pmt(loanAmount, newMR, periods);
    const increase = newPI - monthlyPI;
    const newTotal = totalMonthly + increase;
    const newDTI = grossMonthly > 0 ? (newTotal / grossMonthly) * 100 : 0;
    const survives = newDTI <= 50;

    results.push({
      scenario: `Rate +${bump}%`,
      category: 'rate',
      newValue: newRate.toFixed(2) + '%',
      newPayment: Math.round(newPI * 100) / 100,
      increase: Math.round(increase * 100) / 100,
      newDTI: Math.round(newDTI * 10) / 10,
      survives,
      severity: bump <= 1 ? 'mild' : bump <= 2 ? 'moderate' : 'severe',
      formatted: {
        newPayment: fmt(newPI),
        increase: fmt(increase),
        newDTI: newDTI.toFixed(1) + '%',
      },
    });
  });

  // Income drop scenarios
  if (grossMonthly > 0) {
    const incomeDrops = [10, 20, 30];
    incomeDrops.forEach(dropPct => {
      const newIncome = grossMonthly * (1 - dropPct / 100);
      const newDTI = (totalMonthly / newIncome) * 100;
      const survives = newDTI <= 50;

      results.push({
        scenario: `Income -${dropPct}%`,
        category: 'income',
        newValue: fmt(newIncome) + '/mo',
        newPayment: totalMonthly,
        increase: 0,
        newDTI: Math.round(newDTI * 10) / 10,
        survives,
        severity: dropPct <= 10 ? 'mild' : dropPct <= 20 ? 'moderate' : 'severe',
        formatted: {
          newPayment: fmt(totalMonthly),
          increase: '--',
          newDTI: newDTI.toFixed(1) + '%',
        },
      });
    });
  }

  // Job loss runway
  let jobLossRunway = null;
  if (cashReserves > 0 && totalMonthly > 0) {
    const allExpenses = totalMonthly + monthlyDebts;
    const months = Math.floor(cashReserves / allExpenses);
    jobLossRunway = {
      months,
      reserves: cashReserves,
      monthlyBurn: allExpenses,
      safe: months >= 6,
      formatted: {
        months: months + ' months',
        reserves: fmt(cashReserves),
        monthlyBurn: fmt(allExpenses),
      },
    };
  }

  return { scenarios: results, jobLossRunway };
}

// ============================================================
//  14. equityCrossover  (When equity > cumulative interest)
// ============================================================

export function equityCrossover(params = {}) {
  const purchasePrice = n(params.purchasePrice, 340000);
  const loanAmount    = n(params.loanAmount, 272000);
  const interestRate  = n(params.interestRate, 7);
  const termYears     = n(params.loanTermYears, 30);
  const appreciation  = n(params.annualAppreciation, 3);

  const periods = termYears * 12;
  const mr = interestRate / 100 / 12;
  const payment = pmt(loanAmount, mr, periods);
  const monthlyApprecRate = Math.pow(1 + appreciation / 100, 1 / 12) - 1;

  let balance = loanAmount;
  let cumulativeInterest = 0;
  let crossoverMonth = null;
  let equityExceedsInterestMonth = null;
  const milestones = [];
  const yearlyData = [];

  for (let m = 1; m <= periods; m++) {
    const interestPortion = balance * mr;
    const principalPortion = payment - interestPortion;
    balance -= principalPortion;
    cumulativeInterest += interestPortion;

    const homeValue = purchasePrice * Math.pow(1 + monthlyApprecRate, m);
    const equity = homeValue - Math.max(0, balance);
    const paidDown = loanAmount - Math.max(0, balance);

    // Check crossover: equity > cumulative interest
    if (!crossoverMonth && equity > cumulativeInterest) {
      crossoverMonth = m;
    }

    // Check when principal paid > cumulative interest (without appreciation)
    if (!equityExceedsInterestMonth && paidDown > cumulativeInterest) {
      equityExceedsInterestMonth = m;
    }

    // Yearly snapshots
    if (m % 12 === 0) {
      const yr = m / 12;
      yearlyData.push({
        year: yr,
        equity: Math.round(equity),
        cumulativeInterest: Math.round(cumulativeInterest),
        balance: Math.round(Math.max(0, balance)),
        homeValue: Math.round(homeValue),
        principalPaid: Math.round(paidDown),
        netPosition: Math.round(equity - cumulativeInterest),
      });
    }

    // Key milestones
    if (m === 60) milestones.push({ month: 60, label: 'Year 5', equity: Math.round(equity), interest: Math.round(cumulativeInterest) });
    if (m === 120) milestones.push({ month: 120, label: 'Year 10', equity: Math.round(equity), interest: Math.round(cumulativeInterest) });
    if (m === 180) milestones.push({ month: 180, label: 'Year 15', equity: Math.round(equity), interest: Math.round(cumulativeInterest) });
    if (m === 240) milestones.push({ month: 240, label: 'Year 20', equity: Math.round(equity), interest: Math.round(cumulativeInterest) });
  }

  return {
    crossoverMonth,
    crossoverYear: crossoverMonth ? (crossoverMonth / 12).toFixed(1) : null,
    equityExceedsInterestMonth,
    equityExceedsInterestYear: equityExceedsInterestMonth ? (equityExceedsInterestMonth / 12).toFixed(1) : null,
    yearlyData,
    milestones,
    totalInterest: Math.round(cumulativeInterest),
    formatted: {
      crossover: crossoverMonth ? `Month ${crossoverMonth} (Year ${(crossoverMonth / 12).toFixed(1)})` : 'Never (in loan term)',
      pureEquityCrossover: equityExceedsInterestMonth ? `Month ${equityExceedsInterestMonth} (Year ${(equityExceedsInterestMonth / 12).toFixed(1)})` : 'Never',
    },
  };
}
