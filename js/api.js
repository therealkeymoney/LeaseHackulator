// =============================================================================
// API Integration Module - Vehicle Lease Hackulator v3
// =============================================================================
// MarketCheck, NHTSA, Zippopotam integrations with fallback chains
// =============================================================================

const MARKETCHECK_KEYS = [
  'dH6w8gx3Z2e7PsC1ad11DZMABweOHvpZ',
  'B9F2D6W9piaVFtHoIzk1cbktnC8e2E6I',
  'zLllgtI0ZsHIC2sVCkFFFpDHVoZgGWUk',
  'QpqWtCwCx5VQ4NmQMtaEHb1BWGpt4qda',
  'OgQxtAQIyQXY0VXXgS1TEY7RDMDP2cZ1'
];
let currentKeyIndex = 0;

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';
const ZIPPOPOTAM_BASE = 'https://api.zippopotam.us/us';

const API_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Proxy detection: if served from the Express proxy, route API calls locally
// to avoid CORS and keep keys server-side.
// ---------------------------------------------------------------------------
let USE_PROXY = false;
try {
  const r = await fetch('/api/zip/00000', { method: 'HEAD' }).catch(() => null);
  USE_PROXY = r !== null && r.status < 500;
} catch { /* static file server — no proxy */ }
if (USE_PROXY) console.log('[API] Proxy server detected — routing through /api/');

// =============================================================================
// Helpers
// =============================================================================

/**
 * Fetch with timeout wrapper. Rejects if the request takes longer than
 * the configured timeout.
 */
function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .then(response => {
      clearTimeout(timer);
      return response;
    })
    .catch(err => {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`API request timed out after ${timeoutMs}ms: ${url}`);
      }
      throw err;
    });
}

// =============================================================================
// 1. getNextMarketCheckKey
// =============================================================================

/**
 * Rotates through the pool of MarketCheck API keys, returning the next
 * available key and advancing the index (wraps around).
 */
export function getNextMarketCheckKey() {
  const key = MARKETCHECK_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % MARKETCHECK_KEYS.length;
  return key;
}

// =============================================================================
// 2. decodeVIN
// =============================================================================

/**
 * Decode a VIN using MarketCheck as the primary source with NHTSA fallback.
 * Returns a normalized vehicle descriptor object regardless of source.
 */
export async function decodeVIN(vin) {
  if (!vin || typeof vin !== 'string') {
    throw new Error('decodeVIN: A valid VIN string is required');
  }

  const cleanVIN = vin.trim().toUpperCase();

  // --- MarketCheck (primary) ---
  try {
    const url = USE_PROXY
      ? `/api/marketcheck/decode/${cleanVIN}`
      : `https://mc-api.marketcheck.com/v2/decode/car/vin/${cleanVIN}?api_key=${getNextMarketCheckKey()}`;
    console.log(`[API] MarketCheck VIN decode: ${cleanVIN}`);

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`MarketCheck returned ${response.status}`);
    }

    const data = await response.json();

    return {
      year: data.year || null,
      make: data.make || null,
      model: data.model || null,
      trim: data.trim || null,
      color: data.exterior_color || null,
      interiorColor: data.interior_color || null,
      msrp: data.msrp || null,
      bodyType: data.body_type || null,
      fuelType: data.fuel_type || null,
      drivetrain: data.drivetrain || null,
      engine: data.engine || null,
      transmission: data.transmission || null,
      source: 'marketcheck'
    };
  } catch (mcError) {
    console.warn(`[API] MarketCheck VIN decode failed: ${mcError.message}. Falling back to NHTSA.`);
  }

  // --- NHTSA (fallback) ---
  try {
    const url = USE_PROXY
      ? `/api/nhtsa/decode/${cleanVIN}`
      : `${NHTSA_BASE}/DecodeVin/${cleanVIN}?format=json`;
    console.log(`[API] NHTSA VIN decode: ${cleanVIN}`);

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`NHTSA returned ${response.status}`);
    }

    const data = await response.json();
    const results = data.Results || [];

    // Build a quick lookup map: VariableId/Variable -> Value
    const lookup = {};
    for (const entry of results) {
      if (entry.Variable && entry.Value && entry.Value.trim() !== '') {
        lookup[entry.Variable] = entry.Value.trim();
      }
    }

    // Build engine description from available NHTSA fields
    const engineParts = [
      lookup['EngineConfiguration'],
      lookup['DisplacementL'] ? `${lookup['DisplacementL']}L` : null
    ].filter(Boolean);

    return {
      year: lookup['ModelYear'] ? parseInt(lookup['ModelYear'], 10) : null,
      make: lookup['Make'] || null,
      model: lookup['Model'] || null,
      trim: lookup['Trim'] || null,
      color: null,
      interiorColor: null,
      msrp: null,
      bodyType: lookup['BodyClass'] || null,
      fuelType: lookup['FuelTypePrimary'] || null,
      drivetrain: lookup['DriveType'] || null,
      engine: engineParts.length > 0 ? engineParts.join(' ') : null,
      transmission: null,
      source: 'nhtsa'
    };
  } catch (nhtsaError) {
    console.error(`[API] NHTSA VIN decode also failed: ${nhtsaError.message}`);
    throw new Error(`VIN decode failed for ${cleanVIN}: both MarketCheck and NHTSA unavailable. Last error: ${nhtsaError.message}`);
  }
}

// =============================================================================
// 3. fetchListingData
// =============================================================================

/**
 * Search MarketCheck for active listings matching the given VIN.
 * Returns normalized listing and dealer data from the first result.
 */
export async function fetchListingData(vin) {
  if (!vin || typeof vin !== 'string') {
    throw new Error('fetchListingData: A valid VIN string is required');
  }

  const cleanVIN = vin.trim().toUpperCase();

  try {
    const url = USE_PROXY
      ? `/api/marketcheck/search?vin=${cleanVIN}&rows=1`
      : `https://mc-api.marketcheck.com/v2/search/car/active?api_key=${getNextMarketCheckKey()}&vin=${cleanVIN}&rows=1`;
    console.log(`[API] MarketCheck listing search: ${cleanVIN}`);

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`MarketCheck listing search returned ${response.status}`);
    }

    const data = await response.json();
    const listings = data.listings || [];

    if (listings.length === 0) {
      return null;
    }

    const listing = listings[0];
    const dealer = listing.dealer || {};

    return {
      listingPrice: listing.price || null,
      mileage: listing.miles || null,
      dealerName: dealer.name || null,
      dealerPhone: dealer.phone || null,
      dealerCity: dealer.city || null,
      dealerState: dealer.state || null,
      dealerZip: dealer.zip || null,
      dealerLat: dealer.latitude || null,
      dealerLon: dealer.longitude || null,
      daysOnMarket: listing.dom || null,
      source: listing.source || null,
      stockNumber: listing.stock_no || null,
      listingUrl: listing.vdp_url || null,
      condition: listing.inventory_type || null
    };
  } catch (error) {
    console.error(`[API] Listing data fetch failed: ${error.message}`);
    throw new Error(`Failed to fetch listing data for VIN ${cleanVIN}: ${error.message}`);
  }
}

// =============================================================================
// 4. lookupZIP
// =============================================================================

/**
 * Look up location data for a US ZIP code using the Zippopotam API.
 * Returns city, state, coordinates. County is not available from this
 * provider so it is returned as an empty string.
 */
export async function lookupZIP(zip) {
  if (!zip || typeof zip !== 'string') {
    throw new Error('lookupZIP: A valid ZIP code string is required');
  }

  const cleanZIP = zip.trim();

  try {
    const url = USE_PROXY
      ? `/api/zip/${cleanZIP}`
      : `${ZIPPOPOTAM_BASE}/${cleanZIP}`;
    console.log(`[API] Zippopotam ZIP lookup: ${cleanZIP}`);

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`Zippopotam returned ${response.status} for ZIP ${cleanZIP}`);
    }

    const data = await response.json();
    const place = data.places && data.places[0];

    if (!place) {
      throw new Error(`No location data found for ZIP ${cleanZIP}`);
    }

    return {
      city: place['place name'] || null,
      state: place['state abbreviation'] || null,
      county: '',
      lat: place.latitude ? parseFloat(place.latitude) : null,
      lon: place.longitude ? parseFloat(place.longitude) : null,
      source: 'zippopotam'
    };
  } catch (error) {
    console.error(`[API] ZIP lookup failed: ${error.message}`);
    throw new Error(`ZIP lookup failed for ${cleanZIP}: ${error.message}`);
  }
}

// =============================================================================
// 5. fetchIncentives
// =============================================================================

/**
 * Search MarketCheck for active listings in a given area and extract any
 * incentive data attached to those listings.
 */
export async function fetchIncentives(zip, year, make, model) {
  if (!zip || !year || !make || !model) {
    throw new Error('fetchIncentives: zip, year, make, and model are all required');
  }

  try {
    const params = new URLSearchParams({
      year: String(year),
      make,
      model,
      zip: String(zip),
      rows: '5'
    });
    let url;
    if (USE_PROXY) {
      url = `/api/marketcheck/search?${params}`;
    } else {
      params.set('api_key', getNextMarketCheckKey());
      url = `https://mc-api.marketcheck.com/v2/search/car/active?${params}`;
    }
    console.log(`[API] MarketCheck incentives search: ${year} ${make} ${model} near ${zip}`);

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`MarketCheck incentives search returned ${response.status}`);
    }

    const data = await response.json();
    const listings = data.listings || [];
    const incentives = [];

    for (const listing of listings) {
      // MarketCheck may embed incentive data in different fields depending
      // on the listing source. We normalise whatever we find.
      const raw = listing.incentives || listing.rebates || [];
      const items = Array.isArray(raw) ? raw : [raw];

      for (const item of items) {
        if (!item) continue;
        incentives.push({
          type: (item.type || 'rebate').toLowerCase(),
          name: item.name || item.title || 'Manufacturer Incentive',
          amount: item.amount || item.value || null,
          description: item.description || item.details || null,
          expires: item.expires || item.end_date || null
        });
      }

      // Also check for lease/finance specials embedded at listing level
      if (listing.lease_special) {
        incentives.push({
          type: 'lease',
          name: 'Lease Special',
          amount: listing.lease_special.monthly_payment || null,
          description: listing.lease_special.details || `${listing.lease_special.months || ''}mo lease special`,
          expires: listing.lease_special.expires || null
        });
      }

      if (listing.finance_special) {
        incentives.push({
          type: 'finance',
          name: 'Finance Special',
          amount: listing.finance_special.apr || null,
          description: listing.finance_special.details || `${listing.finance_special.apr || ''}% APR special`,
          expires: listing.finance_special.expires || null
        });
      }
    }

    console.log(`[API] Found ${incentives.length} incentive(s) for ${year} ${make} ${model}`);
    return incentives;
  } catch (error) {
    console.error(`[API] Incentives fetch failed: ${error.message}`);
    throw new Error(`Incentives fetch failed for ${year} ${make} ${model}: ${error.message}`);
  }
}

// =============================================================================
// 6. calculateDistance
// =============================================================================

/**
 * Calculate the great-circle distance between two geographic coordinate
 * pairs using the Haversine formula. Returns distance in miles.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS_MILES = 3958.8;

  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

// =============================================================================
// 7. fullVINLookup
// =============================================================================

/**
 * Orchestrate a complete VIN lookup: decode the VIN, fetch listing data,
 * resolve the user's ZIP, and compute the distance to the dealer.
 * Returns a single merged result object.
 */
export async function fullVINLookup(vin, zip) {
  if (!vin || typeof vin !== 'string') {
    throw new Error('fullVINLookup: A valid VIN string is required');
  }

  const cleanVIN = vin.trim().toUpperCase();
  console.log(`[API] Starting full VIN lookup: ${cleanVIN}${zip ? ` (ZIP: ${zip})` : ''}`);

  const result = {
    vin: cleanVIN,
    vehicle: null,
    listing: null,
    location: null,
    distance: null,
    errors: []
  };

  // Step 1 - Decode VIN (required)
  try {
    result.vehicle = await decodeVIN(cleanVIN);
  } catch (error) {
    result.errors.push({ step: 'decodeVIN', message: error.message });
    console.error(`[API] Full lookup - VIN decode failed: ${error.message}`);
    // Vehicle decode is critical; return early with whatever we have
    return result;
  }

  // Step 2 - Fetch listing data (optional, non-blocking)
  try {
    result.listing = await fetchListingData(cleanVIN);
  } catch (error) {
    result.errors.push({ step: 'fetchListingData', message: error.message });
    console.warn(`[API] Full lookup - Listing fetch failed: ${error.message}`);
  }

  // Step 3 - ZIP lookup (optional, only if provided)
  if (zip) {
    try {
      result.location = await lookupZIP(zip);
    } catch (error) {
      result.errors.push({ step: 'lookupZIP', message: error.message });
      console.warn(`[API] Full lookup - ZIP lookup failed: ${error.message}`);
    }
  }

  // Step 4 - Calculate distance if we have both coordinate pairs
  const dealerLat = result.listing?.dealerLat;
  const dealerLon = result.listing?.dealerLon;
  const userLat = result.location?.lat;
  const userLon = result.location?.lon;

  if (dealerLat != null && dealerLon != null && userLat != null && userLon != null) {
    try {
      result.distance = Math.round(
        calculateDistance(userLat, userLon, dealerLat, dealerLon) * 10
      ) / 10;
      console.log(`[API] Distance to dealer: ${result.distance} miles`);
    } catch (error) {
      result.errors.push({ step: 'calculateDistance', message: error.message });
      console.warn(`[API] Full lookup - Distance calculation failed: ${error.message}`);
    }
  }

  console.log(`[API] Full VIN lookup complete. Errors: ${result.errors.length}`);
  return result;
}
