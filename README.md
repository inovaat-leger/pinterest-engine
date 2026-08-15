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

The CLI writes `output/campaign.json` and `output/pins.csv`. You can choose other paths:

```bash
npm run dev -- generate --config campaign.example.json --output output/example
```

Build and run the compiled CLI:

```bash
npm run build
npm start -- generate --config campaign.example.json
```

## Scope

This version generates campaign assets locally. It does not publish pins or create paid Pinterest ads. Those operations require a Pinterest developer app, an access token with the appropriate scopes, an advertiser or board ID, and API integration. Secrets should go in `.env`, which is ignored by Git.
