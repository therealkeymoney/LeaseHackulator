// data.js - Data layer module for vehicle lease/finance calculator

// ============================================================================
// 1. MANUFACTURER FEES
// ============================================================================

export const MANUFACTURER_FEES = {
  'Acura': { acquisitionFee: 695, dispositionFee: 395 },
  'Alfa Romeo': { acquisitionFee: 795, dispositionFee: 395 },
  'Audi': { acquisitionFee: 895, dispositionFee: 395 },
  'BMW': { acquisitionFee: 925, dispositionFee: 350 },
  'Buick': { acquisitionFee: 595, dispositionFee: 395 },
  'Cadillac': { acquisitionFee: 595, dispositionFee: 395 },
  'Chevrolet': { acquisitionFee: 595, dispositionFee: 395 },
  'Chrysler': { acquisitionFee: 595, dispositionFee: 395 },
  'Dodge': { acquisitionFee: 595, dispositionFee: 395 },
  'Fiat': { acquisitionFee: 595, dispositionFee: 395 },
  'Ford': { acquisitionFee: 645, dispositionFee: 395 },
  'Genesis': { acquisitionFee: 595, dispositionFee: 400 },
  'GMC': { acquisitionFee: 595, dispositionFee: 395 },
  'Honda': { acquisitionFee: 595, dispositionFee: 395 },
  'Hyundai': { acquisitionFee: 650, dispositionFee: 400 },
  'Infiniti': { acquisitionFee: 695, dispositionFee: 395 },
  'Jaguar': { acquisitionFee: 895, dispositionFee: 395 },
  'Jeep': { acquisitionFee: 595, dispositionFee: 395 },
  'Kia': { acquisitionFee: 650, dispositionFee: 400 },
  'Land Rover': { acquisitionFee: 895, dispositionFee: 395 },
  'Lexus': { acquisitionFee: 650, dispositionFee: 350 },
  'Lincoln': { acquisitionFee: 645, dispositionFee: 395 },
  'Lucid': { acquisitionFee: 895, dispositionFee: 395 },
  'Maserati': { acquisitionFee: 895, dispositionFee: 395 },
  'Mazda': { acquisitionFee: 595, dispositionFee: 395 },
  'Mercedes-Benz': { acquisitionFee: 1095, dispositionFee: 595 },
  'Mini': { acquisitionFee: 925, dispositionFee: 350 },
  'Mitsubishi': { acquisitionFee: 595, dispositionFee: 395 },
  'Nissan': { acquisitionFee: 695, dispositionFee: 395 },
  'Polestar': { acquisitionFee: 895, dispositionFee: 395 },
  'Porsche': { acquisitionFee: 1095, dispositionFee: 595 },
  'Ram': { acquisitionFee: 595, dispositionFee: 395 },
  'Rivian': { acquisitionFee: 895, dispositionFee: 395 },
  'Subaru': { acquisitionFee: 595, dispositionFee: 395 },
  'Tesla': { acquisitionFee: 695, dispositionFee: 395 },
  'Toyota': { acquisitionFee: 650, dispositionFee: 350 },
  'Volkswagen': { acquisitionFee: 695, dispositionFee: 395 },
  'Volvo': { acquisitionFee: 695, dispositionFee: 395 }
};

// ============================================================================
// 2. FALLBACK RESIDUALS
// ============================================================================

export const FALLBACK_RESIDUALS = {
  sedan: {
    24: { 10000: 62, 12000: 60, 15000: 57 },
    36: { 10000: 55, 12000: 53, 15000: 50 },
    48: { 10000: 45, 12000: 43, 15000: 40 }
  },
  suv: {
    24: { 10000: 64, 12000: 62, 15000: 59 },
    36: { 10000: 57, 12000: 55, 15000: 52 },
    48: { 10000: 47, 12000: 45, 15000: 42 }
  },
  truck: {
    24: { 10000: 66, 12000: 64, 15000: 61 },
    36: { 10000: 59, 12000: 57, 15000: 54 },
    48: { 10000: 49, 12000: 47, 15000: 44 }
  },
  luxury: {
    24: { 10000: 58, 12000: 56, 15000: 53 },
    36: { 10000: 50, 12000: 48, 15000: 45 },
    48: { 10000: 40, 12000: 38, 15000: 35 }
  },
  ev: {
    24: { 10000: 60, 12000: 58, 15000: 55 },
    36: { 10000: 52, 12000: 50, 15000: 47 },
    48: { 10000: 42, 12000: 40, 15000: 37 }
  },
  default: {
    24: { 10000: 61, 12000: 59, 15000: 56 },
    36: { 10000: 54, 12000: 52, 15000: 49 },
    48: { 10000: 44, 12000: 42, 15000: 39 }
  }
};

// ============================================================================
// 3. DATA LOADING FUNCTIONS
// ============================================================================

/**
 * Loads all external JSON data files into window globals.
 * Each file is loaded independently so a single failure does not block the rest.
 */
export async function loadExternalData() {
  const loads = [
    {
      path: 'data/epa_vehicles.json',
      target: 'EPA_DATA',
      fallback: []
    },
    {
      path: 'data/man_fees.json',
      target: 'MANUFACTURER_FEES_EXT',
      fallback: {},
      postProcess: (data) => {
        // Merge external fees with built-in; external takes precedence
        return { ...MANUFACTURER_FEES, ...data };
      }
    },
    {
      path: 'data/scraped_residuals.json',
      target: 'SCRAPED_DATA',
      fallback: {}
    },
    {
      path: 'data/scenarios.json',
      target: 'SCENARIOS',
      fallback: []
    },
    {
      path: 'data/epadata_flat.json',
      target: 'EPADATA',
      fallback: []
    }
  ];

  const results = await Promise.allSettled(
    loads.map(async ({ path, target, fallback, postProcess }) => {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} loading ${path}`);
        }
        let data = await response.json();
        if (postProcess) {
          data = postProcess(data);
        }
        window[target] = data;
        return { target, success: true };
      } catch (err) {
        console.warn(`[data.js] Failed to load ${path}: ${err.message}`);
        // Only set fallback if nothing already assigned
        if (!window[target]) {
          window[target] = fallback;
        }
        return { target, success: false, error: err.message };
      }
    })
  );

  return results.map((r) => r.value || r.reason);
}

// ============================================================================
// 4. LOOKUP HELPERS
// ============================================================================

/**
 * Returns acquisition and disposition fees for a given make.
 * Checks external data first, then built-in MANUFACTURER_FEES.
 * Falls back to { 695, 395 } if no match is found.
 */
export function getManufacturerFees(make) {
  if (!make) {
    return { acquisitionFee: 695, dispositionFee: 395 };
  }

  const normalized = make.trim();

  // Check externally loaded fees first
  if (window.MANUFACTURER_FEES_EXT && window.MANUFACTURER_FEES_EXT[normalized]) {
    return { ...window.MANUFACTURER_FEES_EXT[normalized] };
  }

  // Check built-in table
  if (MANUFACTURER_FEES[normalized]) {
    return { ...MANUFACTURER_FEES[normalized] };
  }

  // Case-insensitive fallback search
  const lower = normalized.toLowerCase();
  const extFees = window.MANUFACTURER_FEES_EXT || {};
  for (const key of Object.keys(extFees)) {
    if (key.toLowerCase() === lower) {
      return { ...extFees[key] };
    }
  }
  for (const key of Object.keys(MANUFACTURER_FEES)) {
    if (key.toLowerCase() === lower) {
      return { ...MANUFACTURER_FEES[key] };
    }
  }

  return { acquisitionFee: 695, dispositionFee: 395 };
}

/**
 * Returns a residual value percentage for a vehicle.
 *
 * Priority:
 *  1. Scraped data (window.SCRAPED_DATA) for exact make/model/term/mileage
 *  2. FALLBACK_RESIDUALS by vehicleClass / term / closest mileage
 *  3. Default 52%
 */
export function getResidualValue(make, model, term, mileage, vehicleClass) {
  const DEFAULT_RESIDUAL = 52;

  // --- 1. Check scraped data ---
  if (window.SCRAPED_DATA && make && model) {
    const scraped = window.SCRAPED_DATA;
    const makeKey = make.trim().toLowerCase();
    const modelKey = model.trim().toLowerCase();

    // Support both nested object and array formats
    if (Array.isArray(scraped)) {
      const match = scraped.find((entry) => {
        if (!entry) return false;
        const eMake = (entry.make || '').toLowerCase();
        const eModel = (entry.model || '').toLowerCase();
        return eMake === makeKey && eModel === modelKey &&
               Number(entry.term) === Number(term) &&
               Number(entry.mileage) === Number(mileage);
      });
      if (match && match.residual != null) {
        return Number(match.residual);
      }
    } else if (typeof scraped === 'object') {
      // Nested: scraped[make][model][term][mileage]
      const makeData = scraped[make] || scraped[makeKey];
      if (makeData) {
        const modelData = makeData[model] || makeData[modelKey];
        if (modelData) {
          const termData = modelData[term] || modelData[String(term)];
          if (termData) {
            const residual = termData[mileage] || termData[String(mileage)];
            if (residual != null) {
              return Number(residual);
            }
          }
        }
      }
    }
  }

  // --- 2. Check fallback residuals ---
  const cls = (vehicleClass || 'default').toLowerCase();
  const classData = FALLBACK_RESIDUALS[cls] || FALLBACK_RESIDUALS['default'];
  if (classData) {
    const termData = classData[term] || classData[String(term)];
    if (termData) {
      // Exact mileage match
      if (termData[mileage] != null) {
        return termData[mileage];
      }
      // Closest mileage match
      const mileageKeys = Object.keys(termData).map(Number).sort((a, b) => a - b);
      if (mileageKeys.length > 0) {
        const numMileage = Number(mileage) || 12000;
        let closest = mileageKeys[0];
        let closestDist = Math.abs(numMileage - closest);
        for (const mk of mileageKeys) {
          const dist = Math.abs(numMileage - mk);
          if (dist < closestDist) {
            closest = mk;
            closestDist = dist;
          }
        }
        if (termData[closest] != null) {
          return termData[closest];
        }
      }
    }
  }

  // --- 3. Default ---
  return DEFAULT_RESIDUAL;
}

/**
 * Searches EPA data for a matching vehicle and returns fuel/EV specs.
 * Searches window.EPA_DATA (array of objects) and window.EPADATA (flat array).
 * Returns null if no match found.
 */
export function lookupEPAData(year, make, model, trim) {
  if (!make || !model) return null;

  const normalize = (s) => (s || '').toString().trim().toLowerCase();
  const nYear = year ? Number(year) : null;
  const nMake = normalize(make);
  const nModel = normalize(model);
  const nTrim = normalize(trim);

  // Search helper: score a record and extract fields
  function matchRecord(record) {
    if (!record) return null;

    const rMake = normalize(record.make || record.mfr || record.manufacturer);
    const rModel = normalize(record.model || record.carline || record.vehicle);
    const rYear = record.year ? Number(record.year) : null;
    const rTrim = normalize(record.trim || record.trany || record.transmission || '');

    // Make and model must match
    if (rMake !== nMake) return null;
    if (!rModel.includes(nModel) && !nModel.includes(rModel)) return null;

    // Year must match if provided
    if (nYear && rYear && rYear !== nYear) return null;

    // Trim is a bonus match, not required
    let score = 1;
    if (nTrim && rTrim && rTrim.includes(nTrim)) {
      score += 1;
    }

    return {
      score,
      data: {
        cityMPG: record.city08 || record.cityMPG || record.city_mpg || null,
        hwyMPG: record.highway08 || record.hwyMPG || record.hwy_mpg || null,
        combMPG: record.comb08 || record.combMPG || record.comb_mpg || null,
        cityMPGe: record.cityA08 || record.cityMPGe || record.city_mpge || null,
        hwyMPGe: record.highwayA08 || record.hwyMPGe || record.hwy_mpge || null,
        combMPGe: record.combA08 || record.combMPGe || record.comb_mpge || null,
        batteryKWh: record.batteryKWh || record.battery_kwh || record.barrels08 || null,
        rangeElectric: record.range || record.rangeA || record.rangeElectric || record.range_electric || null,
        fuelTankGal: record.fuelTankGal || record.fuel_tank_gal || record.hlv || null,
        fuelType: record.fuelType || record.fuelType1 || record.fuel_type || null
      }
    };
  }

  function searchDataset(dataset) {
    if (!dataset || !Array.isArray(dataset) || dataset.length === 0) return null;
    let bestMatch = null;
    for (const record of dataset) {
      const result = matchRecord(record);
      if (result && (!bestMatch || result.score > bestMatch.score)) {
        bestMatch = result;
      }
    }
    return bestMatch ? bestMatch.data : null;
  }

  // Try EPA_DATA first, then EPADATA
  const result = searchDataset(window.EPA_DATA) || searchDataset(window.EPADATA);
  return result || null;
}

/**
 * Classifies a vehicle into a category based on make, model, and body type.
 * Returns one of: 'sedan', 'suv', 'truck', 'luxury', 'ev', 'sports', 'van', 'default'
 */
export function classifyVehicle(make, model, bodyType) {
  const nMake = (make || '').trim().toLowerCase();
  const nModel = (model || '').trim().toLowerCase();
  const nBody = (bodyType || '').trim().toLowerCase();

  // Luxury brands
  const luxuryBrands = [
    'bmw', 'mercedes-benz', 'audi', 'lexus', 'porsche', 'jaguar',
    'land rover', 'maserati', 'bentley', 'rolls-royce', 'aston martin',
    'lamborghini', 'ferrari', 'mclaren', 'genesis', 'lucid',
    'cadillac', 'lincoln', 'infiniti', 'acura', 'alfa romeo', 'polestar'
  ];

  // EV indicators
  const evKeywords = ['electric', 'ev', 'bev', 'e-tron', 'etron', 'mach-e',
    'ioniq', 'bolt ev', 'bolt euv', 'leaf', 'model s', 'model 3',
    'model x', 'model y', 'rivian', 'lucid', 'polestar', 'id.4',
    'id.3', 'taycan', 'i4', 'ix', 'iq', 'hummer ev', 'lyriq',
    'equinox ev', 'blazer ev', 'silverado ev', 'f-150 lightning',
    'mustang mach-e', 'ariya', 'solterra', 'bz4x'];

  // Truck keywords
  const truckKeywords = ['truck', 'pickup', 'f-150', 'f-250', 'f-350',
    'silverado', 'sierra', 'ram 1500', 'ram 2500', 'ram 3500',
    'tundra', 'tacoma', 'frontier', 'colorado', 'canyon', 'ranger',
    'titan', 'ridgeline', 'gladiator', 'maverick', 'santa cruz'];

  // SUV keywords
  const suvKeywords = ['suv', 'crossover', 'sport utility', 'ute',
    'explorer', 'tahoe', 'suburban', 'expedition', 'pilot',
    'highlander', 'pathfinder', 'rav4', 'cr-v', 'crv', 'cx-5',
    'cx-50', 'cx-90', 'tucson', 'sportage', 'sorento', 'telluride',
    'outback', 'forester', 'rogue', 'murano', 'cherokee',
    'wrangler', '4runner', 'bronco', 'defender', 'range rover',
    'x1', 'x3', 'x5', 'x7', 'q3', 'q5', 'q7', 'q8',
    'glc', 'gle', 'gls', 'gx', 'rx', 'nx', 'ux',
    'enclave', 'traverse', 'equinox', 'trailblazer',
    'escape', 'edge', 'yukon', 'escalade', 'atlas', 'tiguan',
    'xc40', 'xc60', 'xc90', 'rdx', 'mdx', 'qx50', 'qx60', 'qx80'];

  // Sports keywords
  const sportsKeywords = ['sports', 'coupe', 'convertible', 'roadster',
    'corvette', 'camaro', 'mustang', 'challenger', 'charger',
    'supra', '86', 'brz', 'miata', 'mx-5', 'z', '370z', '400z',
    'gt-r', 'nsx', 'rc', 'lc', 'amg gt', 'm2', 'm3', 'm4',
    'cayman', 'boxster', '911', 'tt', 'r8'];

  // Van keywords
  const vanKeywords = ['van', 'minivan', 'sienna', 'odyssey', 'pacifica',
    'carnival', 'transit', 'sprinter', 'promaster', 'metris',
    'grand caravan'];

  const combined = `${nMake} ${nModel} ${nBody}`;

  // Check EV first (takes priority)
  if (nMake === 'tesla' || nMake === 'rivian' || nMake === 'lucid') {
    return 'ev';
  }
  for (const kw of evKeywords) {
    if (combined.includes(kw)) return 'ev';
  }

  // Trucks
  for (const kw of truckKeywords) {
    if (combined.includes(kw)) return 'truck';
  }

  // Vans
  for (const kw of vanKeywords) {
    if (combined.includes(kw)) return 'van';
  }

  // Sports
  for (const kw of sportsKeywords) {
    if (combined.includes(kw)) return 'sports';
  }

  // SUVs
  for (const kw of suvKeywords) {
    if (combined.includes(kw)) return 'suv';
  }

  // Luxury (checked after specific types so a luxury SUV is still SUV-first)
  if (luxuryBrands.includes(nMake)) {
    return 'luxury';
  }

  // Sedan / body type fallback
  if (nBody.includes('sedan') || nBody.includes('hatchback') || nBody.includes('wagon')) {
    return 'sedan';
  }

  return 'default';
}

/**
 * Returns the loaded scenarios array, or an empty array if none loaded.
 */
export function getScenarios() {
  if (window.SCENARIOS && Array.isArray(window.SCENARIOS)) {
    return window.SCENARIOS;
  }
  return [];
}
