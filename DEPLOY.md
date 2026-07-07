# Deploying

There are two independently-deployable pieces. The calculators (the HTML
files) run fine as local files with **no deployment** — deployment only
matters for the two API proxies that unlock live data.

## 1. RentCast property proxy (unlocks housing listing auto-fill)

`propertyproxyworker.js` → a free Cloudflare Worker. Needs a RentCast API
key (free tier: 50 lookups/mo, no card — https://app.rentcast.io/app/api).

### Option A — CLI (turnkey, ~2 min)
```bash
npx wrangler login                       # opens browser OAuth (one time)
npx wrangler secret put RENTCAST_API_KEY # paste your RentCast key
npm run deploy                           # deploys per wrangler.toml
```
`wrangler deploy` prints the URL, e.g. `https://property-proxy.YOURNAME.workers.dev`.

### Option B — Dashboard (no CLI)
1. Cloudflare dash → Workers & Pages → Create → Worker.
2. Paste the contents of `propertyproxyworker.js`, Save & Deploy.
3. Settings → Variables and Secrets → add Secret `RENTCAST_API_KEY`.

### Wire it into the app
Open the calculator, then in the DevTools console (or hardcode the
`PROPERTY_PROXY_URL_DEFAULT` constant in the housing script):
```js
window.PROPERTY_PROXY_URL = "https://property-proxy.YOURNAME.workers.dev";
```
Verify: visit `https://property-proxy.YOURNAME.workers.dev/health` → `{ ok: true, hasKey: true }`.

## 2. Incentive proxy (unlocks vehicle incentives)

`incentiveproxyworker.js`, same pattern (no secret required):
```bash
npm run deploy:incentives
```
Then set `window.INCENTIVE_PROXY_URL = "https://incentive-proxy.YOURNAME.workers.dev"`.

## 3. Hosting the calculator itself (optional)

The app is a self-contained static file. To host it (instead of opening the
HTML locally):
```bash
npm run static     # serves this folder at http://localhost:8080
```
Or drop `daddy_hackulator_MASTER_v5.html` on any static host (GitHub Pages,
Netlify drop, S3, etc.). No build step.

---
**Note:** Deployment requires *your* Cloudflare (and/or host) account — the
`wrangler login` step is an interactive browser OAuth that can't be run
headlessly, so these commands must be run from your machine.
