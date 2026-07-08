// ============================================================
//  housing-data.js  --  Data tables for Housing Hackulator
//  Mirrors the vehicle data.js architecture
// ============================================================

// ============================================================
//  1. STATE PROPERTY TAX RATES
//  Median effective property tax rate (% of home value)
//  Source: Tax Foundation / Census Bureau 2024
// ============================================================

export const STATE_PROPERTY_TAX_RATES = {
  AL: 0.41, AK: 1.19, AZ: 0.62, AR: 0.62, CA: 0.74,
  CO: 0.51, CT: 2.15, DE: 0.57, FL: 0.89, GA: 0.92,
  HI: 0.28, ID: 0.69, IL: 2.27, IN: 0.85, IA: 1.57,
  KS: 1.41, KY: 0.86, LA: 0.55, ME: 1.36, MD: 1.09,
  MA: 1.23, MI: 1.54, MN: 1.12, MS: 0.81, MO: 0.97,
  MT: 0.84, NE: 1.73, NV: 0.60, NH: 2.18, NJ: 2.49,
  NM: 0.80, NY: 1.72, NC: 0.84, ND: 0.98, OH: 1.56,
  OK: 0.90, OR: 0.97, PA: 1.58, RI: 1.63, SC: 0.57,
  SD: 1.31, TN: 0.71, TX: 1.80, UT: 0.63, VT: 1.90,
  VA: 0.82, WA: 1.03, WV: 0.58, WI: 1.85, WY: 0.61,
  DC: 0.56,
};

// ============================================================
//  2. STATE ASSESSMENT RATIOS
//  What percentage of fair market value is taxed
//  (Georgia = 40%, most states = 100%)
// ============================================================

export const STATE_ASSESSMENT_RATIOS = {
  AL: 10,   AK: 100,  AZ: 10,   AR: 20,   CA: 100,
  CO: 6.95, CT: 70,   DE: 100,  FL: 100,  GA: 40,
  HI: 100,  ID: 100,  IL: 33.33,IN: 100,  IA: 100,
  KS: 11.5, KY: 100,  LA: 10,   ME: 100,  MD: 100,
  MA: 100,  MI: 50,   MN: 100,  MS: 15,   MO: 19,
  MT: 100,  NE: 100,  NV: 35,   NH: 100,  NJ: 100,
  NM: 33.33,NY: 100,  NC: 100,  ND: 50,   OH: 35,
  OK: 11,   OR: 100,  PA: 100,  RI: 100,  SC: 4,
  SD: 85,   TN: 25,   TX: 100,  UT: 55,   VT: 100,
  VA: 100,  WA: 100,  WV: 60,   WI: 100,  WY: 9.5,
  DC: 100,
};

// ============================================================
//  3. HOMESTEAD EXEMPTIONS BY STATE
//  Amount or value exempted from assessed value for primary residence
//  These are base amounts; many states have additional senior/vet/disability
// ============================================================

export const HOMESTEAD_EXEMPTIONS = {
  AL: { base: 4000, senior: 5000, veteran: 0, disability: 0, notes: 'Under 65: $4,000 assessed value' },
  AK: { base: 150000, senior: 150000, veteran: 150000, disability: 150000, notes: 'First $150K exempt' },
  AZ: { base: 0, senior: 0, veteran: 3000, disability: 3000, notes: 'Limited exemptions' },
  CA: { base: 7000, senior: 0, veteran: 4000, disability: 100000, notes: '$7K assessed value exempt' },
  CO: { base: 0, senior: 200000, veteran: 0, disability: 0, notes: 'Senior: 50% of first $200K' },
  CT: { base: 0, senior: 0, veteran: 1500, disability: 1000, notes: 'Veteran/disability only' },
  FL: { base: 50000, senior: 50000, veteran: 5000, disability: 5000, notes: 'First $25K + addl $25K (non-school)' },
  GA: { base: 2000, senior: 4000, veteran: 60000, disability: 60000, notes: '$2K off assessed for school taxes' },
  HI: { base: 100000, senior: 140000, veteran: 0, disability: 0, notes: 'Varies by county' },
  IL: { base: 10000, senior: 8000, veteran: 5000, disability: 0, notes: '$10K off EAV' },
  IN: { base: 48000, senior: 14000, veteran: 0, disability: 12480, notes: '60% of first $80K' },
  LA: { base: 75000, senior: 75000, veteran: 7500, disability: 7500, notes: 'First $75K FMV exempt' },
  MA: { base: 0, senior: 1000, veteran: 400, disability: 500, notes: 'Off tax bill, not value' },
  MI: { base: 0, senior: 0, veteran: 0, disability: 0, notes: 'PRE reduces school tax by 18 mills' },
  MN: { base: 0, senior: 0, veteran: 150000, disability: 150000, notes: 'Market Value Homestead Credit' },
  NJ: { base: 0, senior: 250, veteran: 250, disability: 250, notes: 'Deduction off tax bill' },
  NY: { base: 0, senior: 50, veteran: 15, disability: 50, notes: 'Varies by municipality' },
  OH: { base: 26200, senior: 26200, veteran: 0, disability: 50000, notes: '$26.2K off market value' },
  PA: { base: 0, senior: 0, veteran: 0, disability: 0, notes: 'Varies by jurisdiction' },
  SC: { base: 50000, senior: 50000, veteran: 50000, disability: 50000, notes: 'First $50K FMV exempt (school only)' },
  TX: { base: 100000, senior: 10000, veteran: 12000, disability: 10000, notes: '$100K school + $10K optional' },
  VA: { base: 0, senior: 0, veteran: 0, disability: 0, notes: 'Localities may offer' },
  WA: { base: 0, senior: 75000, veteran: 0, disability: 0, notes: 'Senior/disabled income-based' },
};

// ============================================================
//  4. ASSESSMENT CAP RULES
//  States that limit annual assessment increases
// ============================================================

export const ASSESSMENT_CAPS = {
  CA: { capPct: 2, notes: 'Prop 13: max 2% annual increase until sale' },
  FL: { capPct: 3, notes: 'Save Our Homes: max 3% or CPI annual increase' },
  GA: { capPct: 3, notes: 'Floating homestead: value frozen at base year + CPI' },
  MD: { capPct: 10, notes: 'Homestead Tax Credit: max 10% annual increase' },
  MI: { capPct: 5, notes: 'Max 5% or CPI whichever less, resets on sale' },
  TX: { capPct: 10, notes: 'Max 10% annual increase for homestead' },
  AZ: { capPct: 5, notes: 'Limited property value: max 5% annual increase' },
  AR: { capPct: 5, notes: 'Amendment 79: max 5% for homestead' },
  NY: { capPct: 6, notes: 'NYC: max 6% annual, 20% over 5 years for 1-3 family' },
  OR: { capPct: 3, notes: 'Measure 50: max 3% annual increase' },
};

// ============================================================
//  5. PMI RATE TABLE (Conventional)
//  Annual PMI rate (%) by LTV bracket and credit tier
// ============================================================

export const PMI_RATES = {
  tier1: { // 760+
    80.01_85: 0.30, 85.01_90: 0.45, 90.01_95: 0.65, 95.01_97: 0.85,
  },
  tier2: { // 720-759
    80.01_85: 0.38, 85.01_90: 0.58, 90.01_95: 0.82, 95.01_97: 1.05,
  },
  tier3: { // 680-719
    80.01_85: 0.52, 85.01_90: 0.78, 90.01_95: 1.10, 95.01_97: 1.40,
  },
  tier4: { // 640-679
    80.01_85: 0.72, 85.01_90: 1.05, 90.01_95: 1.45, 95.01_97: 1.80,
  },
  tier5: { // <640
    80.01_85: 0.95, 85.01_90: 1.35, 90.01_95: 1.85, 95.01_97: 2.25,
  },
};

// ============================================================
//  6. FHA / VA / USDA LOAN PARAMETERS
// ============================================================

export const FHA_PARAMS = {
  upfrontMIPPct: 1.75, // 1.75% of base loan amount
  annualMIP: {
    // For 30-year terms
    above_95LTV: 0.85,  // 0.85% annual (for life of loan if <10% down)
    at_or_below_95LTV: 0.80,
    // For 15-year terms
    above_90LTV_15yr: 0.70,
    at_or_below_90LTV_15yr: 0.45,
  },
  minDownPct: 3.5,      // 3.5% minimum (580+ credit)
  minDownPctLow: 10,    // 10% minimum (500-579 credit)
  maxDTI_front: 31,
  maxDTI_back: 43,      // can go higher with compensating factors
  loanLimits2024: {
    floor: 498257,       // low-cost areas
    ceiling: 1149825,    // high-cost areas
    defaultSingle: 498257,
  },
};

export const VA_PARAMS = {
  fundingFee: {
    firstUse: { down_0: 2.15, down_5: 1.50, down_10: 1.25 },
    subsequentUse: { down_0: 3.30, down_5: 1.50, down_10: 1.25 },
    reserves: { down_0: 2.15, down_5: 1.50, down_10: 1.25 },
  },
  // Exempt from funding fee: 10%+ disability rating, surviving spouse, Purple Heart
  noMonthlyPMI: true,
  noPMI: true,
  maxDTI_back: 41,
};

export const USDA_PARAMS = {
  guaranteeFeeUpfrontPct: 1.0,  // 1% of loan
  annualFeePct: 0.35,           // 0.35% annual
  minDownPct: 0,                // 0% down
  incomeLimit: 115,             // 115% of area median income
  maxDTI_front: 29,
  maxDTI_back: 41,
};

// ============================================================
//  7. CONFORMING LOAN LIMITS (2024)
// ============================================================

export const CONFORMING_LIMITS = {
  singleUnit: 766550,
  duplex: 981500,
  triplex: 1186350,
  fourPlex: 1474400,
  highCost: {
    singleUnit: 1149825,
    duplex: 1472250,
    triplex: 1779525,
    fourPlex: 2211600,
  },
};

// ============================================================
//  8. AVERAGE HOMEOWNER INSURANCE RATES BY STATE
//  Annual average premium for $300K dwelling coverage
// ============================================================

export const STATE_INSURANCE_RATES = {
  AL: 2400, AK: 1200, AZ: 1800, AR: 2700, CA: 1500,
  CO: 2700, CT: 1700, DE: 1100, FL: 4200, GA: 2000,
  HI: 1000, ID: 1200, IL: 1800, IN: 1500, IA: 1800,
  KS: 3200, KY: 2400, LA: 3600, ME: 1200, MD: 1500,
  MA: 1600, MI: 1600, MN: 1800, MS: 3000, MO: 2400,
  MT: 1800, NE: 3200, NV: 1200, NH: 1100, NJ: 1200,
  NM: 1800, NY: 1500, NC: 1800, ND: 2100, OH: 1200,
  OK: 3800, OR: 1100, PA: 1200, RI: 1800, SC: 2100,
  SD: 2400, TN: 2100, TX: 3400, UT: 1100, VT: 1000,
  VA: 1400, WA: 1200, WV: 1200, WI: 1200, WY: 1500,
  DC: 1200,
};

// ============================================================
//  9. STATE TRANSFER TAX / RECORDING TAX
//  Rate per $1,000 of sale price (or special formula)
// ============================================================

export const STATE_TRANSFER_TAX = {
  AL: { rate: 0.50, per: 500, notes: '$0.50 per $500' },
  AK: { rate: 0, per: 0, notes: 'No transfer tax' },
  AZ: { rate: 0, per: 0, notes: 'No transfer tax (flat recording fee ~$30)' },
  CA: { rate: 1.10, per: 1000, notes: '$1.10 per $1,000' },
  CO: { rate: 0.01, per: 100, notes: '$0.01 per $100' },
  CT: { rate: 7.50, per: 1000, notes: '$7.50 per $1,000 (0.75%)' },
  DE: { rate: 4.00, per: 100, notes: '4% split buyer/seller' },
  FL: { rate: 0.70, per: 100, notes: '$0.70 per $100' },
  GA: { rate: 1.00, per: 1000, notes: '$1.00 per $1,000 + intangible tax $1.50/$500 on new mortgage' },
  HI: { rate: 0.20, per: 100, notes: '$0.20 per $100 (varies by price)' },
  IL: { rate: 0.50, per: 500, notes: '$0.50 per $500' },
  MD: { rate: 5.00, per: 1000, notes: '$5.00 per $1,000 (split) + recordation' },
  MA: { rate: 4.56, per: 1000, notes: '$4.56 per $1,000' },
  MI: { rate: 8.60, per: 1000, notes: '$8.60 per $1,000' },
  MN: { rate: 3.30, per: 1000, notes: '$3.30 per $1,000' },
  NJ: { rate: 0, per: 0, notes: 'Seller pays; varies by price ($2-$6.05 per $500)' },
  NY: { rate: 4.00, per: 1000, notes: '$4.00 per $1,000 + mansion tax 1%+ above $1M' },
  NC: { rate: 2.00, per: 1000, notes: '$2.00 per $1,000' },
  OH: { rate: 4.00, per: 1000, notes: '$4.00 per $1,000 (varies by county)' },
  PA: { rate: 10.00, per: 1000, notes: '1% state + 1% local (split)' },
  SC: { rate: 3.70, per: 1000, notes: '$3.70 per $1,000' },
  TN: { rate: 3.70, per: 1000, notes: '$0.37 per $100' },
  TX: { rate: 0, per: 0, notes: 'No transfer tax' },
  VA: { rate: 2.50, per: 1000, notes: '$2.50 per $1,000 (grantor tax + recordation)' },
  WA: { rate: 1.28, per: 100, notes: '1.28% of sale price (REET)' },
  DC: { rate: 11.00, per: 1000, notes: '1.1% (residential) up to $400K; 1.45% above' },
};

// ============================================================
//  10. TYPICAL MILL RATE BREAKDOWN RANGES
//  For building default scenarios
// ============================================================

export const TYPICAL_MILL_RANGES = {
  county:       { low: 3, mid: 8,  high: 15 },
  municipal:    { low: 2, mid: 5,  high: 12 },
  school:       { low: 5, mid: 12, high: 22 },
  specialDistrict: { low: 0, mid: 2, high: 5 },
};

// ============================================================
//  11. GEORGIA-SPECIFIC DATA (Cobb County focus)
//  Per user's 6068 Knickerbocker St SW, Mableton context
// ============================================================

export const GEORGIA_DATA = {
  assessmentRatio: 40, // 40% of FMV
  cobbCounty: {
    countyMillRate: 8.46,
    schoolMillRate: 18.90,
    stateMillRate: 0.0,   // GA has no state property tax
    fireDistrict: 2.99,
    bondMillRate: 0.0,
    typicalTotal: 30.35,  // approximate total millage
  },
  douglasCounty: {
    countyMillRate: 12.382,
    schoolMillRate: 18.795,
    stateMillRate: 0.0,
    typicalTotal: 31.177,
  },
  homesteadExemptions: {
    standard: 2000,       // $2,000 off assessed for school taxes
    floatingHomestead: true, // Cobb freezes assessment at base year
    senior62: 4000,       // $4,000 off assessed (age 62+)
    senior65: 10000,      // $10,000 off assessed (age 65+, income limit)
    disabledVeteran: 60000, // $60K off assessed (100% disabled vet)
  },
  intangibleTax: 1.50,   // $1.50 per $500 of new mortgage (one-time at closing)
  transferTax: 1.00,      // $1.00 per $1,000 of sale price
};

// ============================================================
//  12. LEASE-TO-OWN DEFAULT TERMS
// ============================================================

export const LEASE_TO_OWN_DEFAULTS = {
  termMonths: 36,
  optionFeeUpfrontPct: 3,    // 3% of purchase price (typical range 1-5%)
  rentCreditPct: 20,          // 20% of monthly rent credited toward purchase
  rentPremiumPct: 10,         // 10% above market rent
  forfeitureRisk: true,       // credits/fees lost if buyer doesn't close
  annualAppreciationPct: 3,   // home appreciation during lease period
};

// ============================================================
//  13. CLOSING COST DEFAULTS BY LOAN TYPE
// ============================================================

export const CLOSING_COST_DEFAULTS = {
  conventional: {
    originationPct: 1.0,
    appraisal: 450,
    inspection: 400,
    survey: 350,
    titleSearch: 200,
    titleInsurancePct: 0.50,   // % of purchase price
    lendersTitlePct: 0.35,     // % of loan amount
    attorney: 500,
    escrow: 500,
    recording: 125,
    creditReport: 50,
    floodCert: 20,
    notary: 150,
    application: 400,
    underwriting: 500,
  },
  fha: {
    originationPct: 1.0,
    appraisal: 500,
    inspection: 400,
    survey: 350,
    titleSearch: 200,
    titleInsurancePct: 0.50,
    lendersTitlePct: 0.35,
    attorney: 500,
    escrow: 500,
    recording: 125,
    creditReport: 50,
    floodCert: 20,
    notary: 150,
    application: 400,
    underwriting: 500,
    upfrontMIPPct: 1.75,
  },
  va: {
    originationPct: 1.0,
    appraisal: 500,
    inspection: 400,
    survey: 350,
    titleSearch: 200,
    titleInsurancePct: 0.50,
    lendersTitlePct: 0.35,
    attorney: 500,
    escrow: 500,
    recording: 125,
    creditReport: 50,
    floodCert: 20,
    notary: 150,
    application: 0,
    underwriting: 0,
    fundingFeePct: 2.15,
  },
  usda: {
    originationPct: 1.0,
    appraisal: 500,
    inspection: 400,
    survey: 350,
    titleSearch: 200,
    titleInsurancePct: 0.50,
    lendersTitlePct: 0.35,
    attorney: 500,
    escrow: 500,
    recording: 125,
    creditReport: 50,
    floodCert: 20,
    notary: 150,
    application: 400,
    underwriting: 500,
    guaranteeFeePct: 1.0,
  },
};

// ============================================================
//  14. UTILITY COST AVERAGES BY STATE (monthly)
// ============================================================

export const STATE_UTILITY_AVERAGES = {
  AL: { electric: 165, gas: 80, water: 45, sewer: 35, trash: 25, internet: 65 },
  AK: { electric: 130, gas: 75, water: 55, sewer: 40, trash: 30, internet: 70 },
  AZ: { electric: 145, gas: 55, water: 50, sewer: 40, trash: 25, internet: 60 },
  CA: { electric: 170, gas: 65, water: 60, sewer: 50, trash: 35, internet: 65 },
  CO: { electric: 105, gas: 70, water: 45, sewer: 35, trash: 25, internet: 60 },
  CT: { electric: 175, gas: 100, water: 50, sewer: 45, trash: 0, internet: 65 },
  FL: { electric: 155, gas: 45, water: 45, sewer: 40, trash: 25, internet: 60 },
  GA: { electric: 145, gas: 75, water: 50, sewer: 40, trash: 25, internet: 65 },
  HI: { electric: 200, gas: 0, water: 55, sewer: 45, trash: 0, internet: 70 },
  IL: { electric: 115, gas: 85, water: 45, sewer: 35, trash: 25, internet: 60 },
  MA: { electric: 155, gas: 95, water: 50, sewer: 45, trash: 0, internet: 65 },
  MI: { electric: 125, gas: 80, water: 45, sewer: 35, trash: 25, internet: 55 },
  MN: { electric: 120, gas: 85, water: 40, sewer: 35, trash: 25, internet: 60 },
  NJ: { electric: 130, gas: 85, water: 55, sewer: 45, trash: 0, internet: 65 },
  NY: { electric: 145, gas: 80, water: 55, sewer: 50, trash: 0, internet: 65 },
  NC: { electric: 130, gas: 60, water: 45, sewer: 35, trash: 25, internet: 60 },
  OH: { electric: 120, gas: 75, water: 40, sewer: 35, trash: 25, internet: 55 },
  PA: { electric: 135, gas: 85, water: 50, sewer: 40, trash: 25, internet: 60 },
  SC: { electric: 150, gas: 55, water: 40, sewer: 35, trash: 25, internet: 55 },
  TN: { electric: 140, gas: 60, water: 40, sewer: 35, trash: 25, internet: 55 },
  TX: { electric: 145, gas: 55, water: 50, sewer: 40, trash: 25, internet: 60 },
  VA: { electric: 130, gas: 70, water: 45, sewer: 40, trash: 25, internet: 60 },
  WA: { electric: 105, gas: 65, water: 50, sewer: 45, trash: 30, internet: 65 },
};

// ============================================================
//  LOOKUP FUNCTIONS
// ============================================================

/**
 * Get effective property tax rate for a state.
 * @param {string} stateCode - Two-letter state abbreviation
 * @returns {number} Effective rate as percentage (e.g., 0.92 for Georgia)
 */
export function getPropertyTaxRate(stateCode) {
  if (!stateCode) return 1.0;
  const key = String(stateCode).trim().toUpperCase();
  return STATE_PROPERTY_TAX_RATES[key] ?? 1.0;
}

/**
 * Get assessment ratio for a state.
 * @param {string} stateCode
 * @returns {number} Assessment ratio as percentage (e.g., 40 for Georgia)
 */
export function getAssessmentRatio(stateCode) {
  if (!stateCode) return 100;
  const key = String(stateCode).trim().toUpperCase();
  return STATE_ASSESSMENT_RATIOS[key] ?? 100;
}

/**
 * Get homestead exemption details for a state.
 * @param {string} stateCode
 * @returns {object} Exemption details
 */
export function getHomesteadExemption(stateCode) {
  if (!stateCode) return { base: 0, senior: 0, veteran: 0, disability: 0, notes: '' };
  const key = String(stateCode).trim().toUpperCase();
  return HOMESTEAD_EXEMPTIONS[key] ?? { base: 0, senior: 0, veteran: 0, disability: 0, notes: '' };
}

/**
 * Get assessment cap info for a state.
 * @param {string} stateCode
 * @returns {object|null} Cap info or null if no cap
 */
export function getAssessmentCap(stateCode) {
  if (!stateCode) return null;
  const key = String(stateCode).trim().toUpperCase();
  return ASSESSMENT_CAPS[key] ?? null;
}

/**
 * Get average annual homeowner insurance for a state.
 * @param {string} stateCode
 * @returns {number} Annual premium in dollars
 */
export function getInsuranceRate(stateCode) {
  if (!stateCode) return 1800;
  const key = String(stateCode).trim().toUpperCase();
  return STATE_INSURANCE_RATES[key] ?? 1800;
}

/**
 * Get transfer tax info for a state.
 * @param {string} stateCode
 * @returns {object} Transfer tax details
 */
export function getTransferTax(stateCode) {
  if (!stateCode) return { rate: 0, per: 0, notes: 'Unknown' };
  const key = String(stateCode).trim().toUpperCase();
  return STATE_TRANSFER_TAX[key] ?? { rate: 0, per: 0, notes: 'Unknown' };
}

/**
 * Calculate transfer tax for a specific sale.
 * @param {string} stateCode
 * @param {number} salePrice
 * @returns {number} Transfer tax amount
 */
export function calculateTransferTax(stateCode, salePrice) {
  const info = getTransferTax(stateCode);
  if (!info || info.rate === 0 || info.per === 0) return 0;
  return (salePrice / info.per) * info.rate;
}

/**
 * Get average monthly utility costs for a state.
 * @param {string} stateCode
 * @returns {object} Monthly utility averages
 */
export function getUtilityAverages(stateCode) {
  if (!stateCode) return { electric: 130, gas: 70, water: 45, sewer: 35, trash: 25, internet: 60 };
  const key = String(stateCode).trim().toUpperCase();
  return STATE_UTILITY_AVERAGES[key] ?? { electric: 130, gas: 70, water: 45, sewer: 35, trash: 25, internet: 60 };
}

/**
 * Get closing cost defaults for a loan type.
 * @param {string} loanType - conventional, fha, va, usda
 * @returns {object} Default closing costs
 */
export function getClosingCostDefaults(loanType) {
  const type = String(loanType || 'conventional').toLowerCase();
  return CLOSING_COST_DEFAULTS[type] ?? CLOSING_COST_DEFAULTS.conventional;
}

/**
 * Estimate total closing costs for a purchase.
 * @param {string} loanType
 * @param {number} purchasePrice
 * @param {number} loanAmount
 * @returns {number} Estimated total closing costs
 */
export function estimateClosingCosts(loanType, purchasePrice, loanAmount) {
  const defaults = getClosingCostDefaults(loanType);
  let total = 0;

  total += (loanAmount * (defaults.originationPct || 0)) / 100;
  total += defaults.appraisal || 0;
  total += defaults.inspection || 0;
  total += defaults.survey || 0;
  total += defaults.titleSearch || 0;
  total += (purchasePrice * (defaults.titleInsurancePct || 0)) / 100;
  total += (loanAmount * (defaults.lendersTitlePct || 0)) / 100;
  total += defaults.attorney || 0;
  total += defaults.escrow || 0;
  total += defaults.recording || 0;
  total += defaults.creditReport || 0;
  total += defaults.floodCert || 0;
  total += defaults.notary || 0;
  total += defaults.application || 0;
  total += defaults.underwriting || 0;

  return total;
}

/**
 * Get Georgia-specific property tax data (Cobb County).
 * @returns {object} Cobb County tax data
 */
export function getCobbCountyData() {
  return GEORGIA_DATA.cobbCounty;
}

/**
 * Estimate Georgia property tax for Cobb County.
 * @param {number} fairMarketValue
 * @param {boolean} homestead - Whether homestead exemption applies
 * @param {string} exemptionType - 'standard', 'senior62', 'senior65', 'disabledVet'
 * @returns {object} Tax estimate
 */
export function estimateCobbPropertyTax(fairMarketValue, homestead = false, exemptionType = 'standard') {
  const assessed = fairMarketValue * 0.40; // Georgia 40% ratio
  const cobb = GEORGIA_DATA.cobbCounty;
  const exemptions = GEORGIA_DATA.homesteadExemptions;

  let exemptionAmount = 0;
  if (homestead) {
    switch (exemptionType) {
      case 'senior65':   exemptionAmount = exemptions.senior65; break;
      case 'senior62':   exemptionAmount = exemptions.senior62; break;
      case 'disabledVet': exemptionAmount = exemptions.disabledVeteran; break;
      default:           exemptionAmount = exemptions.standard; break;
    }
  }

  const taxable = Math.max(0, assessed - exemptionAmount);
  const annualTax = taxable * cobb.typicalTotal / 1000;
  const monthlyTax = annualTax / 12;

  return {
    fairMarketValue,
    assessed,
    exemptionAmount,
    taxable,
    millRate: cobb.typicalTotal,
    annualTax,
    monthlyTax,
    effectiveRate: fairMarketValue > 0 ? (annualTax / fairMarketValue) * 100 : 0,
  };
}
