#!/usr/bin/env node
/**
 * Daddy's Lease Hackulator — zero-dependency local dev server
 * ============================================================
 *
 * Drop-in replacement for `python3 -m http.server` when Python isn't
 * available (or busy on another port). Uses only built-in Node modules —
 * no `npm install` step required.
 *
 * USAGE:
 *   node server.js                # serves cwd on http://localhost:8000
 *   node server.js 8080           # custom port
 *   node server.js 8080 ../site   # custom port + custom root
 *   PORT=9000 node server.js      # via env var
 *   npm start                     # runs `node server.js` per package.json
 *
 * FEATURES:
 *   - Serves any static file from the chosen root directory
 *   - Auto-redirects `/` → `/daddy_hackulator_MASTER_v5.html` (so you can
 *     hit http://localhost:8000 directly without typing the full filename)
 *   - Open access (CORS *) for the calculator's outbound API calls
 *   - Disables caching so edits show up on refresh without hard-reload
 *   - Directory listing for any folder that has no index.html
 *   - Logs every request with status + timing
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.argv[2] || process.env.PORT || '8000', 10);
const ROOT = path.resolve(process.argv[3] || process.env.ROOT || process.cwd());
const DEFAULT_FILE = 'daddy_hackulator_MASTER_v5.html';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.pdf':  'application/pdf',
  '.map':  'application/json; charset=utf-8',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function safeJoin(root, requestPath) {
  // Decode + strip query/hash — those are handled by url.parse already
  let decoded;
  try { decoded = decodeURIComponent(requestPath); }
  catch { return null; }
  // Resolve and ensure the result is still inside root (block ../ traversal)
  const resolved = path.resolve(root, '.' + decoded);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderDirListing(dir, urlPath) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return null; }
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  const rows = entries.map(e => {
    const name = e.isDirectory() ? e.name + '/' : e.name;
    const href = path.posix.join(urlPath, e.name) + (e.isDirectory() ? '/' : '');
    let info = '';
    if (!e.isDirectory()) {
      try { info = fmtSize(fs.statSync(path.join(dir, e.name)).size); }
      catch { info = '?'; }
    }
    return `    <tr><td><a href="${href}">${name}</a></td><td style="text-align:right;color:#888;">${info}</td></tr>`;
  });
  const parent = urlPath !== '/' ? `    <tr><td colspan="2"><a href="../">../</a></td></tr>\n` : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Index of ${urlPath}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;}
  h1{font-size:1.2rem;color:#111;border-bottom:1px solid #ddd;padding-bottom:8px;}
  table{width:100%;border-collapse:collapse;}
  td{padding:4px 8px;font-family:monospace;font-size:0.9rem;}
  tr:hover{background:#f8fafc;}
  a{color:#1d4ed8;text-decoration:none;}
  a:hover{text-decoration:underline;}
</style></head><body>
<h1>Index of ${urlPath}</h1>
<table>
${parent}${rows.join('\n')}
</table>
</body></html>`;
}

function send(res, status, headers, body) {
  res.writeHead(status, { ...CORS_HEADERS, 'Cache-Control': 'no-cache, no-store, must-revalidate', ...headers });
  if (body !== null && body !== undefined) res.end(body);
  else res.end();
}

// ────────────────────────────────────────────────────────────────────────────
// Server
// ────────────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const t0 = Date.now();
  const parsed = url.parse(req.url);
  let urlPath = parsed.pathname || '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    send(res, 204, {}, null);
    log(req, 204, t0);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, { 'Content-Type': 'text/plain' }, 'Method Not Allowed');
    log(req, 405, t0);
    return;
  }

  // Root → default HTML file
  if (urlPath === '/' && fs.existsSync(path.join(ROOT, DEFAULT_FILE))) {
    res.writeHead(302, { Location: '/' + DEFAULT_FILE, ...CORS_HEADERS });
    res.end();
    log(req, 302, t0, '→ /' + DEFAULT_FILE);
    return;
  }

  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) {
    send(res, 400, { 'Content-Type': 'text/plain' }, 'Bad path');
    log(req, 400, t0);
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      send(res, 404, { 'Content-Type': 'text/plain' }, 'Not Found: ' + urlPath);
      log(req, 404, t0);
      return;
    }
    if (stat.isDirectory()) {
      // Try index.html first
      const indexPath = path.join(filePath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return serveFile(req, res, indexPath, t0);
      }
      // Otherwise render directory listing
      const html = renderDirListing(filePath, urlPath.endsWith('/') ? urlPath : urlPath + '/');
      send(res, 200, { 'Content-Type': 'text/html; charset=utf-8' }, html);
      log(req, 200, t0, '(directory)');
      return;
    }
    serveFile(req, res, filePath, t0);
  });
});

function serveFile(req, res, filePath, t0) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || 'application/octet-stream';
  fs.stat(filePath, (err, stat) => {
    if (err) {
      send(res, 500, { 'Content-Type': 'text/plain' }, 'Stat error');
      log(req, 500, t0);
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      ...CORS_HEADERS,
    });
    if (req.method === 'HEAD') { res.end(); log(req, 200, t0, fmtSize(stat.size) + ' (HEAD)'); return; }
    fs.createReadStream(filePath)
      .on('error', () => { try { res.end(); } catch{} })
      .on('end', () => log(req, 200, t0, fmtSize(stat.size)))
      .pipe(res);
  });
}

function log(req, status, t0, extra) {
  const ms = Date.now() - t0;
  const code = status < 300 ? '\x1b[32m' : status < 400 ? '\x1b[36m' : status < 500 ? '\x1b[33m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`${code}${status}${reset} ${req.method} ${req.url} — ${ms}ms${extra ? ' ' + extra : ''}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Start
// ────────────────────────────────────────────────────────────────────────────

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${PORT} is already in use.`);
    console.error(`   Try a different port:  node server.js ${PORT + 1}`);
    console.error(`   Or kill the process holding it:  lsof -i :${PORT}\n`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n┌─────────────────────────────────────────────────────────────`);
  console.log(`│  Daddy's Lease Hackulator — local dev server`);
  console.log(`├─────────────────────────────────────────────────────────────`);
  console.log(`│  Root:    ${ROOT}`);
  console.log(`│  Default: ${DEFAULT_FILE}`);
  console.log(`├─────────────────────────────────────────────────────────────`);
  console.log(`│  Open:    \x1b[1;36mhttp://localhost:${PORT}/\x1b[0m`);
  console.log(`│  Master:  http://localhost:${PORT}/daddy_hackulator_MASTER_v5.html`);
  console.log(`│  Ult.:    http://localhost:${PORT}/daddy_hackulator_ULTIMATE_v5.html`);
  console.log(`└─────────────────────────────────────────────────────────────\n`);
  console.log(`Press Ctrl+C to stop.\n`);
});

process.on('SIGINT',  () => { console.log('\nShutting down…'); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
