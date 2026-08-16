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

## Destination strategy

`destinationUrl` should usually point to a campaign-specific landing page for a useful product, resource, or free checklist. Pinterest copy and creative briefs should lead with practical value and match what visitors will find on that page.

Affiliate links generally belong inside the digital product, on the landing page, or in follow-up emails, where recommendations can be presented with context and appropriate disclosures. A direct affiliate URL can be tested later when it suits a campaign, but it is optional rather than the default strategy.

## Scope

This version generates campaign assets locally. It does not publish pins or create paid Pinterest ads. Those operations require a Pinterest developer app, an access token with the appropriate scopes, an advertiser or board ID, and API integration. Secrets should go in `.env`, which is ignored by Git.
