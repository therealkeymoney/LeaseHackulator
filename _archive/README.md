# _archive — superseded versions (kept for completeness)

The canonical app is the **daddyshackulator v3** project in the repo root
(`index.html` + `css/` + `js/` + `data/`, plus `housing.html`). The files in
this folder are earlier versions that were committed during restoration and
then superseded when the canonical v3 project was deployed. They are kept here
verbatim so nothing committed is lost. Nothing in the live app references them.

| File | What it is | Superseded by |
|------|------------|---------------|
| `app_bundled_legacy.js` | 6003-line all-in-one "Modular Edition" app bundle (golden-rule validator + trade optimizer + 50 embedded scenarios). NOTE: contains syntax errors from the original source extraction (bare comment lines missing `//`). | `js/app.js` (clean modular) + `js/calculations.js`, `js/api.js`, `js/data.js`, `js/utils.js`. The golden-rule and trade-optimizer features are present in the canonical v3. |
| `server_extended.js` | 11 KB dev server with CORS, directory listing, MIME table, request logging; defaults to serving `daddy_hackulator_MASTER_v5.html`. | `server.js` (v3 zero-dep dev server) |
| `index_modular_stub.html` | Early "Modular Edition" entry-point stub. | `index.html` (full v3 shell) |
| `data_manufacturer_fees.json` | Earlier manufacturer-fees data file. | `data/man_fees.json` (the file `js/data.js` loads) |
| `data_scenarios_scaffold.json` | Empty scenario scaffold (`{"scenarios":[]}`). | `data/scenarios.json` (50 scenarios) |
| `data_scraped_residuals_prior.json` | Earlier scraped-residuals snapshot. | `data/scraped_residuals.json` (v3 snapshot) |
