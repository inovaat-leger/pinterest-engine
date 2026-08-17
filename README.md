# pinterest-engine

A Node.js + TypeScript CLI and lightweight website for generating, tracking, and reviewing Pinterest campaign experiments.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```bash
cd ~/pinterest-engine
npm install
npm run campaign:init
```

Edit `campaign.json`, then generate the campaign:

```bash
npm run campaign:generate
```

The CLI writes the campaign exports plus identity-checked Pinterest scheduling files:

- `output/campaign.json` — complete campaign data
- `output/pins.csv` — pin copy and creative briefs
- `output/image-prompts.csv` — image prompts, overlay text, styles, and PNG filenames for design workflows
- `output/manual-posting.csv` — a posting queue with image filenames and draft status
- `output/canva-bulk-create.csv` — Canva Bulk Create fields for generating pin designs
- `output/pin-image-production.json` — self-contained AI image-production specs for every pin
- `output/experiment-schedule.csv` — the four-week testing matrix and five reserve concepts
- `output/performance-entry.csv` — provider-neutral 7-, 30-, and 90-day metric-entry template
- `output/experiment-manifest.json` — complete machine-readable Pin, experiment, tracking, publication, and review metadata
- `output/pinterest-bulk-upload.csv` — Pinterest Import content CSV with public image URLs and UTC schedule timestamps
- `output/stampdup-philippines-pinterest-v2-schedule.csv` — cache-safe replacement schedule using never-before-used `-v2.png` Media URLs
- `output/stampdup-philippines-v2-preflight.md` — live production byte-identity report from `npm run campaign:verify:v2`
- `output/stampdup-philippines-v2-visual-preflight.png` — contact sheet made from live production responses
- `output/stampdup-philippines-pins-026-045.csv` — 20-row native Pinterest batch for the new Pins #26–#45
- `output/stampdup-philippines-pins-026-045-preflight.md` — live byte-identity, metadata, UTM, and schedule report
- `output/stampdup-philippines-pins-026-045-visual-preflight.png` — contact sheet made only from the new live production responses
- `output/stampdup-philippines-pins-026-045-registry.csv` — import-ready canonical metadata and ALT-text sidecar

Regenerate the same automation-ready exports explicitly with:

```bash
npm run campaign:export
```

The Philippines campaign produces a deliberate 20-Pin sprint—five Pins per week for four weeks—with five concepts held in reserve. Pin #1 is the existing untagged baseline. Pins #2 onward receive stable, unique Pinterest organic UTM URLs. See the [experiment operating guide](docs/PINTEREST_EXPERIMENT_OPERATIONS.md) for the schedule, Pin/experiment IDs, reserve policy, publication workflow, event mapping, performance imports, report commands, and interpretation limits.

Public Pin images use allowlisted Google Drive mappings at `/pins/{campaign}/{filename}`. `config/pin-images.json` is the canonical identity catalog; `config/pin-image-history.json` is the append-only immutable route ledger. Pin ID, title, artwork, Drive ID, SHA-256, versioned public filename, ALT text, publishing metadata, and UTM identity must agree before export. Run `npm run campaign:verify:v2` after deployment to compare live production bytes with Drive and build the final report/contact sheet. See [public Pin images and Pinterest bulk upload](docs/PIN_IMAGE_AND_BULK_UPLOAD.md).

Pins #26–#45 use the same allowlist and immutable ledger with committed, SHA-256-locked artwork under `public/pins/philippines/`; no external credentials are required for those routes. Their editable production backgrounds stay local and ignored, while the finished 1000×1500 PNGs are committed as the approved bytes. Rebuilding or correcting an image requires a new versioned public filename—an existing route must never be repointed. Build the artwork with `npm run campaign:images:build:026-045`, generate exports with `npm run campaign:export`, then run `npm run campaign:verify:026-045` after deployment. The verifier fetches every live URL without redirects, compares it byte-for-byte with the approved file, and creates the final preflight, contact sheet, and Registry sidecar.

Import completed performance rows and produce reports with:

```bash
npm run campaign:performance:import -- --input output/performance-entry.csv
npm run campaign:report -- --window 7
npm run campaign:report -- --window 30
npm run campaign:report -- --window 90
```

Snapshots remain distinct by Pin and review window in `data/performance-snapshots.json`. Blank values mean missing data; zero means an observed zero. Reports are available as JSON and Markdown under `output/reports/`, calculate rates without division-by-zero, and flag results below 1,000 impressions as small samples. Seven-day results are early signals, 30-day results support meaningful comparisons, and 90-day results assess durability and business value.

You can choose other paths:

```bash
npm run dev -- generate --config campaign.example.json --output output/example
```

Build and run the compiled CLI:

```bash
npm run build
node dist/cli.js generate --config campaign.example.json
```

## Website

The same repository includes the dependency-light StampdUp Travel website served by Node's HTTP server:

- `/` — StampdUp Travel homepage
- `/philippines-arrival-kit` — complete Philippines Arrival Kit and primary Pinterest campaign landing page
- `/philippines-arrival-checklist` — interactive, printable checklist with no signup
- `/philippines-arrival-checklist.txt` — downloadable plain-text checklist
- `/health` — JSON health check used by Railway
- `/pins/{campaign}/{filename}` — raw allowlisted Pin image bytes with immutable caching
- `/health/pins/{campaign}/{filename}` — privacy-safe public image diagnostic

Build and run the website locally:

```bash
npm run build
npm start
```

The server reads `PORT` and binds to `0.0.0.0`, with port `3000` as the local fallback. Railway deploys `main`, runs `npm run build`, and starts the service with `npm start`. Unknown routes continue to return a JSON 404 response.

Run the automated website tests after building:

```bash
npm test
```

### Brand assets

Approved assets are committed without modification in `public/assets/`:

- `public/assets/PinLogo.png` — favicon, hero mark, and compact placements
- `public/assets/StampdUpTravelLogo.png` — full horizontal header wordmark

### Affiliate recommendation configuration

The eSIM guidance is provider-neutral by default. No recommendation CTA, placeholder, configuration message, or affiliate disclosure is rendered unless `AFFILIATE_ESIM_URL` contains a valid HTTP or HTTPS URL. Without a valid URL, `/go/esim` returns the standard 404 response.

To enable a future vetted recommendation in Railway, set:

```text
AFFILIATE_ESIM_URL=https://the-approved-provider.example/recommendation
```

The redirect is marked `nofollow sponsored`, preserves supported UTM parameters, and displays an affiliate disclosure on the page. Do not configure this variable until a real approved affiliate destination is available.

### Tracking and privacy

Important internal links preserve `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `utm_content`. The server writes small JSON log events for Arrival Kit visits, checklist opens/downloads, print actions, and configured recommendation clicks. These events contain a timestamp, route, and UTM labels only; they do not intentionally collect IP addresses, cookies, user-agent strings, account details, or email addresses. No third-party analytics are installed. The operating guide maps these event names and `utm_content` values to performance fields.

## Destination strategy

`destinationUrl` should usually point to a campaign-specific landing page for a useful product, resource, or free checklist. Pinterest copy and creative briefs should lead with practical value and match what visitors will find on that page.

Affiliate links generally belong inside the digital product, on the landing page, or in follow-up emails, where recommendations can be presented with context and appropriate disclosures. A direct affiliate URL can be tested later when it suits a campaign, but it is optional rather than the default strategy.

## Scope

This version generates campaign assets and reports locally. Publishing and scheduling remain manual or externally managed: the engine does not publish Pins, connect to a social account, or create paid Pinterest ads. Secrets should go in `.env`, which is ignored by Git.
