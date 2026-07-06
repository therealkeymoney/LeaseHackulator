/**
 * Daddy's Hackulator — Property / Listing Proxy Worker (RentCast)
 * ==============================================================
 * Free Cloudflare Worker that fronts the RentCast API so the Hackulator's
 * HOUSING side can auto-populate a property card from an address, a pasted
 * listing URL (Zillow / Redfin / Realtor / Trulia / Homes.com), or — best
 * effort — an MLS number. Mirrors incentiveproxyworker.js exactly in shape:
 * CORS-unlocked JSON, one file, paste-and-deploy.
 *
 * WHY A PROXY (vs. calling RentCast from the browser directly):
 *   - RentCast does NOT send CORS headers, so a browser fetch is blocked.
 *   - Your API key would be exposed in client JS (free tier = 50 req/mo, so
 *     an exposed key = someone else burns your quota). The Worker keeps the
 *     key server-side in an env var.
 *
 * DEPLOY (5 minutes):
 *   1. Get a free RentCast key at https://app.rentcast.io/app/api (50 req/mo
 *      free, no card; paid tiers are cheap).
 *   2. Sign up at https://dash.cloudflare.com/sign-up (free, no card).
 *   3. Workers & Pages -> Create -> Worker. Replace the starter code with
 *      this file's contents -> Save & Deploy.
 *   4. Settings -> Variables and Secrets -> add a Secret:
 *        RENTCAST_API_KEY = <your RentCast key>
 *   5. Copy the Worker URL (e.g. https://property.YOURNAME.workers.dev).
 *   6. In the Hackulator, set it once in DevTools console:
 *        window.PROPERTY_PROXY_URL = "https://property.YOURNAME.workers.dev";
 *      Or hardcode PROPERTY_PROXY_URL near the top of the housing <script>.
 *
 * ENDPOINTS:
 *   GET /health
 *        -> { ok, service, hasKey, endpoints }
 *   GET /property?address=<full address>[&avm=1]
 *        -> { ok, property, priceHistory, taxHistory, source, raw? }
 *        Merges RentCast Sale Listings + Property Records (+ AVM if avm=1).
 *   GET /mls?mls=<number>&state=<ST>[&city=][&zip=][&daysOld=]
 *        -> { ok, property, priceHistory, taxHistory, source } | { ok:false }
 *        Best-effort: RentCast has no MLS-number lookup param, so this pulls
 *        active area listings and filters client-side by mlsNumber. Requires
 *        at least state (+ city or zip strongly recommended) for a tight,
 *        quota-friendly search.
 *
 * QUOTA MATH (free tier = 50 req/mo):
 *   /property with no avm  = 2 RentCast calls (listings + records)
 *   /property with avm=1   = 3 RentCast calls
 *   /mls                   = 1 RentCast call (area listings) + local filter
 */

const RENTCAST_BASE = 'https://api.rentcast.io/v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      ...CORS_HEADERS,
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// RentCast fetch helper
// ────────────────────────────────────────────────────────────────────────────

async function rc(path, apiKey) {
  const r = await fetch(RENTCAST_BASE + path, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
  });
  if (r.status === 404) return null; // RentCast returns 404 for "no records"
  if (!r.ok) {
    let msg = '';
    try { const d = await r.json(); msg = d.message || d.error || ''; } catch (_) {}
    throw new Error('RentCast ' + r.status + (msg ? ': ' + msg : ''));
  }
  return r.json();
}

// ────────────────────────────────────────────────────────────────────────────
// Normalization: RentCast records/listings -> flat property shape the
// Hackulator housing card understands.
// ────────────────────────────────────────────────────────────────────────────

function mapPropertyType(t) {
  const s = String(t || '').toLowerCase();
  if (s.indexOf('single') >= 0) return 'single_family';
  if (s.indexOf('condo') >= 0 || s.indexOf('town') >= 0) return 'condo';
  if (s.indexOf('multi') >= 0 || s.indexOf('apartment') >= 0 || s.indexOf('duplex') >= 0) return 'multi_family';
  if (s.indexOf('manufactured') >= 0 || s.indexOf('mobile') >= 0) return 'manufactured';
  return 'single_family';
}

// Pull the newest year's total from a RentCast propertyTaxes map
// ({ "2023": { year, total }, ... }) and also return the full sorted history.
function extractTaxHistory(propertyTaxes) {
  const out = [];
  if (propertyTaxes && typeof propertyTaxes === 'object') {
    for (const k of Object.keys(propertyTaxes)) {
      const row = propertyTaxes[k] || {};
      const year = row.year || parseInt(k, 10) || null;
      const total = row.total != null ? row.total : (row.amount != null ? row.amount : null);
      if (year && total != null) out.push({ year: year, amount: total });
    }
  }
  out.sort((a, b) => b.year - a.year);
  return out;
}

// Merge sale/listing `history` maps into a sorted price-history array.
// RentCast history shape: { "2023-05-01": { event, price, listingType, ... } }
function extractPriceHistory() {
  const merged = {};
  for (let i = 0; i < arguments.length; i++) {
    const hist = arguments[i];
    if (!hist || typeof hist !== 'object') continue;
    for (const dateKey of Object.keys(hist)) {
      const ev = hist[dateKey] || {};
      const date = ev.date || dateKey;
      const price = ev.price != null ? ev.price : null;
      if (price == null) continue;
      // Dedup by date+price so listing+record overlaps don't double up.
      const id = date + '|' + price;
      if (!merged[id]) {
        merged[id] = {
          date: date,
          price: price,
          event: ev.event || ev.listingType || 'Price',
        };
      }
    }
  }
  const arr = Object.keys(merged).map((k) => merged[k]);
  arr.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return arr;
}

function num(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

// Build the merged, normalized payload from up to three RentCast objects.
function buildPayload(listing, record, avm) {
  listing = listing || {};
  record = record || {};
  avm = avm || null;

  const agent = listing.listingAgent || {};
  const office = listing.listingOffice || {};

  const taxHistory = extractTaxHistory(record.propertyTaxes);
  const priceHistory = extractPriceHistory(listing.history, record.history);

  // Latest annual property tax
  const latestTax = taxHistory.length ? taxHistory[0].amount : null;

  // Prefer listing fields for anything listing-specific; fall back to record.
  const property = {
    formattedAddress: listing.formattedAddress || record.formattedAddress || null,
    addressLine1: listing.addressLine1 || record.addressLine1 || null,
    city: listing.city || record.city || null,
    state: listing.state || record.state || null,
    zipCode: listing.zipCode || record.zipCode || null,
    county: record.county || listing.county || null,
    propertyTypeRaw: listing.propertyType || record.propertyType || null,
    propertyType: mapPropertyType(listing.propertyType || record.propertyType),
    bedrooms: listing.bedrooms != null ? listing.bedrooms : (record.bedrooms != null ? record.bedrooms : null),
    bathrooms: listing.bathrooms != null ? listing.bathrooms : (record.bathrooms != null ? record.bathrooms : null),
    squareFootage: listing.squareFootage != null ? listing.squareFootage : (record.squareFootage != null ? record.squareFootage : null),
    lotSize: listing.lotSize != null ? listing.lotSize : (record.lotSize != null ? record.lotSize : null),
    yearBuilt: listing.yearBuilt != null ? listing.yearBuilt : (record.yearBuilt != null ? record.yearBuilt : null),

    // Listing / pricing
    listPrice: num(listing.price),
    status: listing.status || null,
    listedDate: listing.listedDate || null,
    daysOnMarket: listing.daysOnMarket != null ? listing.daysOnMarket : null,
    mlsNumber: listing.mlsNumber || null,
    mlsName: listing.mlsName || null,
    listingAgent: agent.name || null,
    listingAgentPhone: agent.phone || null,
    brokerage: office.name || agent.website || null,

    // Records
    lastSalePrice: num(record.lastSalePrice),
    lastSaleDate: record.lastSaleDate || null,
    hoaFee: record.hoa && record.hoa.fee != null ? num(record.hoa.fee) : null,
    annualPropertyTax: latestTax,

    // Valuation (AVM)
    avmValue: avm && avm.price != null ? num(avm.price) : null,
    avmLow: avm && avm.priceRangeLow != null ? num(avm.priceRangeLow) : null,
    avmHigh: avm && avm.priceRangeHigh != null ? num(avm.priceRangeHigh) : null,
  };

  return { property, priceHistory, taxHistory };
}

// ────────────────────────────────────────────────────────────────────────────
// Route handlers
// ────────────────────────────────────────────────────────────────────────────

async function handleProperty(url, apiKey) {
  const address = (url.searchParams.get('address') || '').trim();
  const wantAvm = url.searchParams.get('avm') === '1';
  if (!address) return jsonResponse({ ok: false, error: 'address is required' }, 400);

  const q = '?address=' + encodeURIComponent(address);

  let listingArr = null, recordArr = null, avmObj = null;
  const errors = [];

  // 1) Active sale listing (list price, MLS, agent, DOM, price history)
  try {
    listingArr = await rc('/listings/sale' + q, apiKey);
  } catch (e) { errors.push('listings: ' + e.message); }

  // 2) Property record (tax history, last sale, lot/year/beds fallback)
  try {
    recordArr = await rc('/properties' + q, apiKey);
  } catch (e) { errors.push('properties: ' + e.message); }

  // 3) AVM (optional — costs an extra request against the monthly quota)
  if (wantAvm) {
    try {
      avmObj = await rc('/avm/value' + q, apiKey);
    } catch (e) { errors.push('avm: ' + e.message); }
  }

  const listing = Array.isArray(listingArr) ? listingArr[0] : listingArr;
  const record = Array.isArray(recordArr) ? recordArr[0] : recordArr;

  if (!listing && !record && !avmObj) {
    return jsonResponse({
      ok: false,
      error: 'No RentCast data for that address',
      address,
      errors,
    }, 404);
  }

  const payload = buildPayload(listing, record, avmObj);
  return jsonResponse({
    ok: true,
    source: listing ? 'rentcast-listing' : (record ? 'rentcast-record' : 'rentcast-avm'),
    address,
    ...payload,
    partialErrors: errors.length ? errors : undefined,
  });
}

async function handleMls(url, apiKey) {
  const mls = (url.searchParams.get('mls') || '').trim();
  const state = (url.searchParams.get('state') || '').trim();
  const city = (url.searchParams.get('city') || '').trim();
  const zip = (url.searchParams.get('zip') || '').trim();
  const daysOld = (url.searchParams.get('daysOld') || '').trim();
  if (!mls) return jsonResponse({ ok: false, error: 'mls is required' }, 400);
  if (!state && !zip) {
    return jsonResponse({
      ok: false,
      error: 'MLS-number lookup needs at least a state (and ideally city or zip). RentCast has no direct MLS# query, so this filters an area search.',
    }, 400);
  }

  const params = ['status=Active', 'limit=500'];
  if (state) params.push('state=' + encodeURIComponent(state));
  if (city) params.push('city=' + encodeURIComponent(city));
  if (zip) params.push('zipCode=' + encodeURIComponent(zip));
  if (daysOld) params.push('daysOld=' + encodeURIComponent(daysOld));

  let arr = null;
  try {
    arr = await rc('/listings/sale?' + params.join('&'), apiKey);
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message }, 502);
  }

  const target = String(mls).replace(/[^0-9a-z]/gi, '').toLowerCase();
  const match = (Array.isArray(arr) ? arr : []).find((l) => {
    const m = String(l.mlsNumber || '').replace(/[^0-9a-z]/gi, '').toLowerCase();
    return m && m === target;
  });

  if (!match) {
    return jsonResponse({
      ok: false,
      error: 'MLS #' + mls + ' not found in the ' + (city || zip || state) + ' active-listing set (searched ' + (Array.isArray(arr) ? arr.length : 0) + ' listings). Try the listing URL or full address instead.',
      searched: Array.isArray(arr) ? arr.length : 0,
    }, 404);
  }

  // Enrich the matched listing with a property record for tax history.
  let record = null;
  if (match.formattedAddress) {
    try {
      const recArr = await rc('/properties?address=' + encodeURIComponent(match.formattedAddress), apiKey);
      record = Array.isArray(recArr) ? recArr[0] : recArr;
    } catch (_) {}
  }

  const payload = buildPayload(match, record, null);
  return jsonResponse({ ok: true, source: 'rentcast-mls-filter', mls, ...payload });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const apiKey = (env && env.RENTCAST_API_KEY) || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        service: 'Hackulator property proxy (RentCast)',
        hasKey: !!apiKey,
        endpoints: [
          '/property?address=<full address>[&avm=1]',
          '/mls?mls=<number>&state=<ST>[&city=][&zip=][&daysOld=]',
        ],
      });
    }

    if (!apiKey) {
      return jsonResponse({
        ok: false,
        error: 'Worker is missing RENTCAST_API_KEY. Add it under Settings -> Variables and Secrets.',
      }, 500);
    }

    try {
      if (url.pathname === '/property') return await handleProperty(url, apiKey);
      if (url.pathname === '/mls') return await handleMls(url, apiKey);
    } catch (e) {
      return jsonResponse({ ok: false, error: String((e && e.message) || e) }, 502);
    }

    return jsonResponse({ ok: false, error: 'not found', tried: url.pathname }, 404);
  },
};
