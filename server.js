// =============================================================================
// Proxy Server - daddy's Hackulator v3
// =============================================================================
// Serves static files and proxies external API calls to avoid CORS issues
// and keep API keys server-side.
//
// Usage:
//   node server.js                     → unified (index.html)
//   node server.js --mode housing      → housing only (housing.html)
//   node server.js --mode vehicle      → vehicle only (index.html, vehicle tab)
//   node server.js --port 3000         → custom port
// =============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const PORT = parseInt(getArg('port', '3000'), 10);
const MODE = getArg('mode', 'unified'); // unified | housing | vehicle

const MARKETCHECK_KEYS = [
  'dH6w8gx3Z2e7PsC1ad11DZMABweOHvpZ',
  'B9F2D6W9piaVFtHoIzk1cbktnC8e2E6I',
  'zLllgtI0ZsHIC2sVCkFFFpDHVoZgGWUk',
  'QpqWtCwCx5VQ4NmQMtaEHb1BWGpt4qda',
  'OgQxtAQIyQXY0VXXgS1TEY7RDMDP2cZ1'
];
let currentKeyIndex = 0;

function getNextKey() {
  const key = MARKETCHECK_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % MARKETCHECK_KEYS.length;
  return key;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the directory where server.js lives
const STATIC_ROOT = path.dirname(path.resolve(process.argv[1] || __filename));
app.use(express.static(STATIC_ROOT));

// ---------------------------------------------------------------------------
// Landing page redirect based on mode
// ---------------------------------------------------------------------------

if (MODE === 'housing') {
  app.get('/', (_req, res) => res.redirect('/housing.html'));
}
// unified and vehicle both use index.html (vehicle just starts on vehicle tab)

// ---------------------------------------------------------------------------
// API Proxy Routes
// ---------------------------------------------------------------------------

// Helper: proxy a GET request to an external URL
async function proxyGet(externalUrl, res) {
  try {
    console.log(`[Proxy] → ${externalUrl}`);
    const response = await fetch(externalUrl, {
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error(`[Proxy] Error: ${err.message}`);
    res.status(502).json({ error: 'Proxy request failed', details: err.message });
  }
}

// --- MarketCheck: VIN Decode ---
app.get('/api/marketcheck/decode/:vin', (req, res) => {
  const key = getNextKey();
  const url = `https://mc-api.marketcheck.com/v2/decode/car/vin/${encodeURIComponent(req.params.vin)}?api_key=${key}`;
  proxyGet(url, res);
});

// --- MarketCheck: Listing Search ---
app.get('/api/marketcheck/search', (req, res) => {
  const key = getNextKey();
  const params = new URLSearchParams(req.query);
  params.set('api_key', key);
  const url = `https://mc-api.marketcheck.com/v2/search/car/active?${params}`;
  proxyGet(url, res);
});

// --- NHTSA: VIN Decode ---
app.get('/api/nhtsa/decode/:vin', (req, res) => {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${encodeURIComponent(req.params.vin)}?format=json`;
  proxyGet(url, res);
});

// --- Zippopotam: ZIP Lookup ---
app.get('/api/zip/:zip', (req, res) => {
  const url = `https://api.zippopotam.us/us/${encodeURIComponent(req.params.zip)}`;
  proxyGet(url, res);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  const modeLabel = {
    unified: 'Unified (Vehicle + Housing)',
    housing: 'Housing Only',
    vehicle: 'Vehicle Only'
  };
  console.log(`\n  daddy's Hackulator Proxy Server`);
  console.log(`  ────────────────────────────────`);
  console.log(`  Mode:  ${modeLabel[MODE] || MODE}`);
  console.log(`  URL:   http://localhost:${PORT}`);
  console.log(`  Proxy: /api/marketcheck/* /api/nhtsa/* /api/zip/*\n`);
});
