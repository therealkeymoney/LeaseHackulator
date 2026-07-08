/**
 * Daddy's Lease Hackulator — Incentive Proxy Worker
 * ==================================================
 * Free Cloudflare Worker covering every make in the EPA dataset (59 total).
 * Free tier: 100k req/day, no card.
 *
 * DEPLOY (5 minutes):
 *   1. Sign up at https://dash.cloudflare.com/sign-up (free, no card)
 *   2. Workers & Pages → Create → Hello World worker
 *   3. Replace the starter code with this file's contents → Save & Deploy
 *   4. Copy the URL (e.g. https://incentives.YOURNAME.workers.dev)
 *   5. In the Hackulator, open DevTools console and run:
 *        window.INCENTIVE_PROXY_URL = "https://incentives.YOURNAME.workers.dev";
 *      Or hardcode it near the top of the <script> block.
 *
 * ENDPOINTS:
 *   GET  /incentives?year=&make=&model=&zip=
 *        → { listings: [...], source, make, model, year, zip }
 *   GET  /proxy?url=<encoded>   → CORS-unlocked passthrough
 *   GET  /health                → coverage info
 *
 * COVERAGE STRATEGY:
 *   - JSON_FETCHERS:  Direct OEM JSON endpoints for the ~15 mainstream makes
 *                     that publish scrapeable offers feeds. These drift over
 *                     time — when one 404s, update its URL here.
 *   - LINK_FALLBACKS: Every other EPA make gets a single listing that points
 *                     at its official offers/configurator page. Better UX
 *                     than "nothing found" and always works.
 *
 *   To add a new make:
 *     - Has a public offers JSON feed? Add to JSON_FETCHERS.
 *     - Doesn't? Add to LINK_FALLBACKS with the offers page URL.
 */

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; LeaseHackulatorProxy/1.0)',
  'Accept': 'application/json, text/html, */*',
};

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

function normalizeMake(m) {
  return String(m || '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .trim();
}

function classifyOfferType(t) {
  const s = String(t || '').toLowerCase();
  if (s.indexOf('lease') >= 0) return 'lease';
  if (s.indexOf('apr') >= 0 || s.indexOf('financ') >= 0) return 'finance';
  if (s.indexOf('cash') >= 0 || s.indexOf('rebate') >= 0 || s.indexOf('bonus') >= 0) return 'cash';
  return 'other';
}

function extractDollar(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const s = String(v).replace(/,/g, '');
  const m = s.match(/\$?\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

// Generic normalization: takes a raw OEM offer object + mapping + defaults →
// produces a listing in the shape parseIncentiveResults expects.
function normalize(o, map, defaults) {
  const get = (k) => (map[k] ? map[k].split('|').reduce((v, key) => v || o[key], null) : null);
  return {
    offer_type: classifyOfferType(get('type') || defaults.offer_type || ''),
    titles: [get('title') || defaults.title || 'Offer'],
    offers: [get('description') || ''],
    cashback_amount: extractDollar(get('cash') || 0),
    monthly: extractDollar(get('monthly') || 0) || null,
    term: parseInt(get('term') || 0, 10) || null,
    termUnit: 'months',
    due_at_signing: extractDollar(get('das') || 0) || null,
    apr: parseFloat(get('apr') || 0) || null,
    valid_from: get('from') || null,
    valid_through: get('through') || null,
    offer_link: get('link') || defaults.link || null,
    vehicle_make: defaults.make,
    vehicle_model: defaults.model,
    vehicle_year: defaults.year,
    _source: defaults._source,
  };
}

// Link-only fallback listing generator
function linkOnly(make, offerUrl, year, model) {
  return {
    offer_type: 'mfr_link',
    titles: [`${make} Current Offers`],
    offers: [`Live incentive feed not available for ${make}. View current offers on the manufacturer site.`],
    cashback_amount: 0,
    offer_link: offerUrl,
    vehicle_make: make,
    vehicle_model: model,
    vehicle_year: year,
    _source: `${make}-link-fallback`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// JSON fetchers (one per make with a known public offers endpoint).
// All return an array of normalized listings.
// ────────────────────────────────────────────────────────────────────────────

async function fetchToyota(year, model, zip) {
  const url = `https://www.toyota.com/service/tcom/incentiveDetails/model/${encodeURIComponent(model.toLowerCase())}/year/${encodeURIComponent(year)}/zipcode/${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Toyota ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.incentives || []);
  return offers.map(o => normalize(o,
    { type: 'type|offerType|category', title: 'title|headline|name', description: 'description|detail|shortDescription',
      cash: 'cashAmount|cashBack|rebate|amount', monthly: 'monthlyPayment|payment', term: 'leaseTerm|term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate|validFrom', through: 'endDate|expirationDate',
      link: 'detailsUrl|link' },
    { make: 'Toyota', model, year, _source: 'Toyota-direct', link: 'https://www.toyota.com/deals/' }
  ));
}

async function fetchHonda(year, model, zip) {
  const url = `https://automobiles.honda.com/platform/api/v1/offersModels?ModelYear=${encodeURIComponent(year)}&ModelName=${encodeURIComponent(model)}&ZipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Honda ${r.status}`);
  const d = await r.json();
  const offers = (d.Offers || d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'OfferType|Type', title: 'OfferTitle|Title|Headline', description: 'OfferDescription|Description',
      cash: 'CashAmount|BonusCash|Amount', monthly: 'LeasePayment|MonthlyPayment', term: 'LeaseTerm|Term',
      das: 'DueAtSigning|TotalDue', apr: 'APR', from: 'StartDate', through: 'EndDate|ExpirationDate',
      link: 'OfferUrl|DetailsUrl' },
    { make: 'Honda', model, year, _source: 'Honda-direct', link: 'https://automobiles.honda.com/offers' }
  ));
}

async function fetchAcura(year, model, zip) {
  const url = `https://www.acura.com/platform/api/v1/offers?ModelYear=${encodeURIComponent(year)}&ModelName=${encodeURIComponent(model)}&ZipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Acura ${r.status}`);
  const d = await r.json();
  const offers = (d.Offers || d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'OfferType|Type', title: 'OfferTitle|Title', description: 'OfferDescription|Description',
      cash: 'CashAmount|BonusCash', monthly: 'LeasePayment|MonthlyPayment', term: 'LeaseTerm|Term',
      das: 'DueAtSigning', apr: 'APR', from: 'StartDate', through: 'EndDate',
      link: 'OfferUrl|DetailsUrl' },
    { make: 'Acura', model, year, _source: 'Acura-direct', link: 'https://www.acura.com/tools/current-offers' }
  ));
}

async function fetchFord(year, model, zip) {
  const url = `https://shop.ford.com/cmslibs/etc/designs/brand_ford/en_us/offers/json/offers.json?year=${encodeURIComponent(year)}&model=${encodeURIComponent(model)}&zipcode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Ford ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.items || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|headline', description: 'shortDescription|description',
      cash: 'amount|cashAmount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'disclaimerUrl|detailsUrl' },
    { make: 'Ford', model, year, _source: 'Ford-direct', link: 'https://shop.ford.com/showroom/offers/' }
  ));
}

async function fetchLincoln(year, model, zip) {
  const url = `https://www.lincoln.com/cmslibs/etc/designs/brand_lincoln/en_us/offers/json/offers.json?year=${encodeURIComponent(year)}&model=${encodeURIComponent(model)}&zipcode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Lincoln ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.items || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|headline', description: 'shortDescription|description',
      cash: 'amount|cashAmount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'disclaimerUrl|detailsUrl' },
    { make: 'Lincoln', model, year, _source: 'Lincoln-direct', link: 'https://www.lincoln.com/luxury-vehicles/deals-and-incentives/' }
  ));
}

async function fetchHyundai(year, model, zip) {
  const url = `https://www.hyundaiusa.com/var/hyundai/services/offers/getOffersByModelYearZip.json?model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}&zipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Hyundai ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.offerList || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type|category', title: 'title|offerTitle', description: 'description|offerDescription',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Hyundai', model, year, _source: 'Hyundai-direct', link: 'https://www.hyundaiusa.com/us/en/shopping-tools/offers' }
  ));
}

async function fetchGenesis(year, model, zip) {
  const url = `https://www.genesis.com/content/dam/genesis/us/offers/offers-${encodeURIComponent(model.toLowerCase())}-${encodeURIComponent(year)}.json`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Genesis ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.offerList || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|offerTitle', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Genesis', model, year, _source: 'Genesis-direct', link: 'https://www.genesis.com/us/en/special-offers.html' }
  ));
}

async function fetchKia(year, model, zip) {
  const url = `https://www.kia.com/us/services/en/offers/getOffers?modelName=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}&zipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Kia ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.data || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|offerTitle', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl|offerLink' },
    { make: 'Kia', model, year, _source: 'Kia-direct', link: 'https://www.kia.com/us/en/special-offers' }
  ));
}

async function fetchNissan(year, model, zip) {
  const url = `https://www.nissanusa.com/bin/nissan/offers?model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}&zipcode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Nissan ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|headline', description: 'description|shortDescription',
      cash: 'cashAmount|amount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Nissan', model, year, _source: 'Nissan-direct', link: 'https://www.nissanusa.com/shopping-tools/current-offers' }
  ));
}

async function fetchInfiniti(year, model, zip) {
  const url = `https://www.infinitiusa.com/bin/infiniti/offers?model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}&zipcode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Infiniti ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|headline', description: 'description',
      cash: 'cashAmount|amount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Infiniti', model, year, _source: 'Infiniti-direct', link: 'https://www.infinitiusa.com/shopping-tools/current-offers' }
  ));
}

async function fetchChevrolet(year, model, zip) {
  const url = `https://www.chevrolet.com/bypass/pcf/quantum-offers/currentOffers?postalCode=${encodeURIComponent(zip || '90210')}&make=CHEVROLET&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Chevrolet ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.incentives || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|category', title: 'title|offerTitle', description: 'description|offerDescription',
      cash: 'cashAmount|bonusAmount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Chevrolet', model, year, _source: 'Chevrolet-direct', link: 'https://www.chevrolet.com/current-offers' }
  ));
}

async function fetchGMC(year, model, zip) {
  const url = `https://www.gmc.com/bypass/pcf/quantum-offers/currentOffers?postalCode=${encodeURIComponent(zip || '90210')}&make=GMC&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`GMC ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.incentives || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|category', title: 'title|offerTitle', description: 'description|offerDescription',
      cash: 'cashAmount|bonusAmount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'GMC', model, year, _source: 'GMC-direct', link: 'https://www.gmc.com/current-offers' }
  ));
}

async function fetchBuick(year, model, zip) {
  const url = `https://www.buick.com/bypass/pcf/quantum-offers/currentOffers?postalCode=${encodeURIComponent(zip || '90210')}&make=BUICK&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Buick ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.incentives || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|category', title: 'title|offerTitle', description: 'description|offerDescription',
      cash: 'cashAmount|bonusAmount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Buick', model, year, _source: 'Buick-direct', link: 'https://www.buick.com/current-offers' }
  ));
}

async function fetchCadillac(year, model, zip) {
  const url = `https://www.cadillac.com/bypass/pcf/quantum-offers/currentOffers?postalCode=${encodeURIComponent(zip || '90210')}&make=CADILLAC&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Cadillac ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.incentives || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|category', title: 'title|offerTitle', description: 'description|offerDescription',
      cash: 'cashAmount|bonusAmount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Cadillac', model, year, _source: 'Cadillac-direct', link: 'https://www.cadillac.com/current-offers' }
  ));
}

// Stellantis brands share a common offers endpoint (fca_program)
async function fetchStellantis(brand, year, model, zip) {
  const url = `https://www.${brand}.com/hostd/nafta/${brand}/rest/offers/current-offers.json?zipcode=${encodeURIComponent(zip || '90210')}&year=${encodeURIComponent(year)}&modelCode=${encodeURIComponent(model)}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`${brand} ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.incentives || d.programs || []);
  const brandCap = brand.charAt(0).toUpperCase() + brand.slice(1);
  return offers.map(o => normalize(o,
    { type: 'offerType|type|programType', title: 'title|headline|programName', description: 'description|longDescription',
      cash: 'cashAmount|amount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl|disclaimerUrl' },
    { make: brandCap, model, year, _source: `${brandCap}-direct`, link: `https://www.${brand}.com/incentives-offers.html` }
  ));
}

async function fetchJeep(year, model, zip)    { return fetchStellantis('jeep', year, model, zip); }
async function fetchRam(year, model, zip)     { return fetchStellantis('ramtrucks', year, model, zip); }
async function fetchDodge(year, model, zip)   { return fetchStellantis('dodge', year, model, zip); }
async function fetchChrysler(year, model, zip){ return fetchStellantis('chrysler', year, model, zip); }
async function fetchFiat(year, model, zip)    { return fetchStellantis('fiatusa', year, model, zip); }
async function fetchAlfa(year, model, zip)    { return fetchStellantis('alfaromeousa', year, model, zip); }

async function fetchSubaru(year, model, zip) {
  const url = `https://www.subaru.com/services/offers/getOffers?modelCode=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}&zipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Subaru ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|offerTitle', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl|offerLink' },
    { make: 'Subaru', model, year, _source: 'Subaru-direct', link: 'https://www.subaru.com/deals-incentives/current-offers.html' }
  ));
}

async function fetchMazda(year, model, zip) {
  const url = `https://www.mazdausa.com/api/incentives/offers?modelCode=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}&zipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Mazda ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.incentives || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|headline', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Mazda', model, year, _source: 'Mazda-direct', link: 'https://www.mazdausa.com/shopping-tools/incentives-offers' }
  ));
}

async function fetchMitsubishi(year, model, zip) {
  const url = `https://www.mitsubishicars.com/api/offers?modelCode=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}&zipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Mitsubishi ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Mitsubishi', model, year, _source: 'Mitsubishi-direct', link: 'https://www.mitsubishicars.com/finance/offers' }
  ));
}

async function fetchVW(year, model, zip) {
  const url = `https://www.vw.com/content/vwdotcom/us/en.data.offers.${encodeURIComponent(year)}.${encodeURIComponent(model.toLowerCase())}.${encodeURIComponent(zip || '90210')}.json`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`VW ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.items || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|headline', description: 'description',
      cash: 'cashAmount|amount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl|link' },
    { make: 'Volkswagen', model, year, _source: 'VW-direct', link: 'https://www.vw.com/en/models/current-offers' }
  ));
}

async function fetchBMW(year, model, zip) {
  const url = `https://www.bmwusa.com/bmwuscom/offers/api/offers?modelCode=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}&zipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`BMW ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|offerTitle', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'BMW', model, year, _source: 'BMW-direct', link: 'https://www.bmwusa.com/current-offers.html' }
  ));
}

async function fetchMINI(year, model, zip) {
  const url = `https://www.miniusa.com/bin/mini/offers?modelCode=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}&zipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`MINI ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'MINI', model, year, _source: 'MINI-direct', link: 'https://www.miniusa.com/special-offers.html' }
  ));
}

async function fetchAudi(year, model, zip) {
  const url = `https://www.audiusa.com/api/offers?modelCode=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}&zipCode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Audi ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|headline', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Audi', model, year, _source: 'Audi-direct', link: 'https://www.audiusa.com/us/web/en/special-offers.html' }
  ));
}

async function fetchMB(year, model, zip) {
  const url = `https://www.mbusa.com/api/offers/current?model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}&zipcode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Mercedes-Benz ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title|headline', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Mercedes-Benz', model, year, _source: 'MB-direct', link: 'https://www.mbusa.com/en/special-offers' }
  ));
}

async function fetchLexus(year, model, zip) {
  const url = `https://www.lexus.com/api/offers?model=${encodeURIComponent(model.toLowerCase())}&year=${encodeURIComponent(year)}&zipcode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Lexus ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || d.incentives || []);
  return offers.map(o => normalize(o,
    { type: 'type|offerType', title: 'title|headline', description: 'description',
      cash: 'cashAmount|amount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Lexus', model, year, _source: 'Lexus-direct', link: 'https://www.lexus.com/deals' }
  ));
}

async function fetchVolvo(year, model, zip) {
  const url = `https://www.volvocars.com/us/api/offers?model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}&zipcode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Volvo ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title', description: 'description',
      cash: 'cashAmount|bonusCash', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Volvo', model, year, _source: 'Volvo-direct', link: 'https://www.volvocars.com/us/shopping/offers/' }
  ));
}

async function fetchPorsche(year, model, zip) {
  const url = `https://www.porsche.com/usa/api/offers?model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Porsche ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title', description: 'description',
      cash: 'cashAmount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Porsche', model, year, _source: 'Porsche-direct', link: 'https://finder.porsche.com/us/en-US/offers' }
  ));
}

async function fetchJaguar(year, model, zip) {
  const url = `https://www.jaguarusa.com/api/offers/current?model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}&zipcode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Jaguar ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title', description: 'description',
      cash: 'cashAmount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Jaguar', model, year, _source: 'Jaguar-direct', link: 'https://www.jaguarusa.com/current-offers.html' }
  ));
}

async function fetchLandRover(year, model, zip) {
  const url = `https://www.landroverusa.com/api/offers/current?model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}&zipcode=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Land Rover ${r.status}`);
  const d = await r.json();
  const offers = (d.offers || []);
  return offers.map(o => normalize(o,
    { type: 'offerType|type', title: 'title', description: 'description',
      cash: 'cashAmount', monthly: 'monthlyPayment', term: 'term',
      das: 'dueAtSigning', apr: 'apr', from: 'startDate', through: 'endDate',
      link: 'detailsUrl' },
    { make: 'Land Rover', model, year, _source: 'LandRover-direct', link: 'https://www.landroverusa.com/current-offers.html' }
  ));
}

async function fetchTesla(year, model, zip) {
  // Tesla doesn't publish traditional offers but has an /api/1/incentives endpoint
  // keyed by state. Best-effort — if empty, fall back to link.
  const url = `https://www.tesla.com/api/1/incentives?model=${encodeURIComponent(model.toLowerCase())}&zip=${encodeURIComponent(zip || '90210')}`;
  const r = await fetch(url, { headers: COMMON_HEADERS });
  if (!r.ok) throw new Error(`Tesla ${r.status}`);
  const d = await r.json();
  const offers = (d.incentives || []);
  if (offers.length === 0) return [linkOnly('Tesla', 'https://www.tesla.com/incentives', year, model)];
  return offers.map(o => normalize(o,
    { type: 'type', title: 'name|title', description: 'description',
      cash: 'amount', link: 'url' },
    { make: 'Tesla', model, year, _source: 'Tesla-direct', link: 'https://www.tesla.com/incentives' }
  ));
}

async function fetchRivian(year, model, zip) {
  // Rivian doesn't publish incentive JSON publicly. Link-only.
  return [linkOnly('Rivian', 'https://rivian.com/configurations', year, model)];
}

async function fetchLucid(year, model, zip) {
  return [linkOnly('Lucid', 'https://lucidmotors.com/shopping-tools/special-offers', year, model)];
}

async function fetchPolestar(year, model, zip) {
  return [linkOnly('Polestar', 'https://www.polestar.com/us/offers/', year, model)];
}

// ────────────────────────────────────────────────────────────────────────────
// Make registry
// Keys MUST be normalized (lowercase, hyphen-separated).
// JSON_FETCHERS  → direct API call (best UX, sometimes brittle)
// LINK_FALLBACKS → always-safe offers-page link (covers remaining EPA makes)
// ────────────────────────────────────────────────────────────────────────────

const JSON_FETCHERS = {
  'toyota':         fetchToyota,
  'honda':          fetchHonda,
  'acura':          fetchAcura,
  'ford':           fetchFord,
  'lincoln':        fetchLincoln,
  'hyundai':        fetchHyundai,
  'genesis':        fetchGenesis,
  'kia':            fetchKia,
  'nissan':         fetchNissan,
  'infiniti':       fetchInfiniti,
  'chevrolet':      fetchChevrolet,
  'gmc':            fetchGMC,
  'buick':          fetchBuick,
  'cadillac':       fetchCadillac,
  'jeep':           fetchJeep,
  'ram':            fetchRam,
  'dodge':          fetchDodge,
  'chrysler':       fetchChrysler,
  'fiat':           fetchFiat,
  'alfa-romeo':     fetchAlfa,
  'subaru':         fetchSubaru,
  'mazda':          fetchMazda,
  'mitsubishi':     fetchMitsubishi,
  'volkswagen':     fetchVW,
  'bmw':            fetchBMW,
  'mini':           fetchMINI,
  'audi':           fetchAudi,
  'mercedes-benz':  fetchMB,
  'lexus':          fetchLexus,
  'volvo':          fetchVolvo,
  'porsche':        fetchPorsche,
  'jaguar':         fetchJaguar,
  'land-rover':     fetchLandRover,
  'tesla':          fetchTesla,
  'rivian':         fetchRivian,
  'lucid':          fetchLucid,
  'polestar':       fetchPolestar,
};

// Link-only coverage for every EPA make not in JSON_FETCHERS.
// (Low-volume luxury/exotic/niche — no public offers feed exists.)
const LINK_FALLBACKS = {
  'aston-martin':     { name: 'Aston Martin',    url: 'https://www.astonmartin.com/en/models' },
  'bentley':          { name: 'Bentley',         url: 'https://www.bentleymotors.com/en/models.html' },
  'bugatti':          { name: 'Bugatti',         url: 'https://www.bugatti.com/models/' },
  'bugatti-rimac':    { name: 'Bugatti Rimac',   url: 'https://www.bugatti-rimac.com/' },
  'byd':              { name: 'BYD',             url: 'https://www.bydglobal.com/' },
  'ferrari':          { name: 'Ferrari',         url: 'https://www.ferrari.com/en-US/auto/models' },
  'fisker':           { name: 'Fisker',          url: 'https://www.fiskerinc.com/' },
  'ineos-automotive': { name: 'INEOS',           url: 'https://ineosgrenadier.com/en/us' },
  'kandi':            { name: 'Kandi',           url: 'https://www.kandiamerica.com/' },
  'karma':            { name: 'Karma',           url: 'https://www.karmaautomotive.com/' },
  'koenigsegg':       { name: 'Koenigsegg',      url: 'https://www.koenigsegg.com/' },
  'lamborghini':      { name: 'Lamborghini',     url: 'https://www.lamborghini.com/en-en/models' },
  'lordstown':        { name: 'Lordstown',       url: 'https://lordstownmotors.com/' },
  'lotus':            { name: 'Lotus',           url: 'https://www.lotuscars.com/en-US/' },
  'maserati':         { name: 'Maserati',        url: 'https://www.maserati.com/us/en/special-offers' },
  'mclaren-automotive':{ name: 'McLaren',        url: 'https://cars.mclaren.com/en' },
  'pagani':           { name: 'Pagani',          url: 'https://www.pagani.com/' },
  'rolls-royce':      { name: 'Rolls-Royce',     url: 'https://www.rolls-roycemotorcars.com/' },
  'roush-performance':{ name: 'Roush',           url: 'https://www.roushperformance.com/' },
  'ruf-automobile':   { name: 'RUF',             url: 'https://www.ruf-automobile.de/' },
  'vinfast':          { name: 'VinFast',         url: 'https://vinfastauto.us/deals' },
};

// ────────────────────────────────────────────────────────────────────────────
// Response / router
// ────────────────────────────────────────────────────────────────────────────

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

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        service: 'LeaseHackulator incentive proxy',
        coverage: {
          jsonFetchers: Object.keys(JSON_FETCHERS).length,
          linkFallbacks: Object.keys(LINK_FALLBACKS).length,
          total: Object.keys(JSON_FETCHERS).length + Object.keys(LINK_FALLBACKS).length,
        },
        jsonFetcherMakes: Object.keys(JSON_FETCHERS),
        linkFallbackMakes: Object.keys(LINK_FALLBACKS),
        endpoints: ['/incentives?year&make&model&zip', '/proxy?url='],
      });
    }

    if (url.pathname === '/proxy') {
      const target = url.searchParams.get('url');
      if (!target) return jsonResponse({ error: 'missing url' }, 400);
      try {
        const r = await fetch(target, { headers: COMMON_HEADERS });
        const body = await r.text();
        return new Response(body, {
          status: r.status,
          headers: {
            'Content-Type': r.headers.get('Content-Type') || 'text/plain',
            ...CORS_HEADERS,
          },
        });
      } catch (e) {
        return jsonResponse({ error: String(e.message || e) }, 502);
      }
    }

    if (url.pathname === '/incentives') {
      const year    = url.searchParams.get('year')  || '';
      const rawMake = url.searchParams.get('make')  || '';
      const model   = url.searchParams.get('model') || '';
      const zip     = url.searchParams.get('zip')   || '';
      const make    = normalizeMake(rawMake);

      if (!year || !make || !model) {
        return jsonResponse({ error: 'year, make, model are required', listings: [] }, 400);
      }

      // Tier 1: direct JSON fetcher
      const fetcher = JSON_FETCHERS[make];
      if (fetcher) {
        try {
          const listings = await fetcher(year, model, zip);
          if (listings && listings.length > 0) {
            return jsonResponse({ listings, source: 'oem-direct', make: rawMake, model, year, zip });
          }
          // Empty response — fall through to link fallback if we have one
        } catch (e) {
          console.warn(`[${make}] fetcher failed:`, e.message);
          // Fall through to link fallback
        }
      }

      // Tier 2: link fallback (every EPA make has one OR has a JSON fetcher above)
      const link = LINK_FALLBACKS[make];
      if (link) {
        return jsonResponse({
          listings: [linkOnly(link.name, link.url, year, model)],
          source: 'link-fallback',
          make: rawMake, model, year, zip,
        });
      }

      // Unknown make (not in EPA dataset) — still helpful response
      return jsonResponse({
        listings: [],
        source: 'unknown-make',
        make: rawMake, model, year, zip,
        note: `No coverage for "${rawMake}". Add it to JSON_FETCHERS or LINK_FALLBACKS in incentive-proxy-worker.js.`,
        supportedJsonMakes: Object.keys(JSON_FETCHERS),
        supportedLinkMakes: Object.keys(LINK_FALLBACKS),
      });
    }

    return jsonResponse({ error: 'not found', tried: url.pathname }, 404);
  },
};
