# pinterest-engine

A Node.js + TypeScript CLI that turns a campaign configuration into a local Pinterest campaign plan, pin copy, creative briefs, and an import-friendly CSV.

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

The CLI writes six files:

- `output/campaign.json` — complete campaign data
- `output/pins.csv` — pin copy and creative briefs
- `output/image-prompts.csv` — image prompts, overlay text, styles, and PNG filenames for design workflows
- `output/manual-posting.csv` — a posting queue with image filenames and draft status
- `output/canva-bulk-create.csv` — Canva Bulk Create fields for generating pin designs
- `output/pin-image-production.json` — self-contained AI image-production specs for every pin

Regenerate the same automation-ready exports explicitly with:

```bash
npm run campaign:export
```

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

Important internal links preserve `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `utm_content`. The server writes small JSON log events for Arrival Kit visits, checklist opens/downloads, and configured recommendation clicks. These events contain a timestamp, route, and UTM labels only; they do not intentionally collect IP addresses, cookies, user-agent strings, account details, or email addresses. No third-party analytics are installed.

## Destination strategy

`destinationUrl` should usually point to a campaign-specific landing page for a useful product, resource, or free checklist. Pinterest copy and creative briefs should lead with practical value and match what visitors will find on that page.

Affiliate links generally belong inside the digital product, on the landing page, or in follow-up emails, where recommendations can be presented with context and appropriate disclosures. A direct affiliate URL can be tested later when it suits a campaign, but it is optional rather than the default strategy.

## Scope

This version generates campaign assets locally. It does not publish pins or create paid Pinterest ads. Those operations require a Pinterest developer app, an access token with the appropriate scopes, an advertiser or board ID, and API integration. Secrets should go in `.env`, which is ignored by Git.
