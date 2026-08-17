#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { csvRecords } from "./csv.js";
import { verifyProductionPinImages, productionVerificationMarkdown } from "./image-verification.js";
import { canonicalPinIdentities, validatePinImageHistory, validatePinImageManifest } from "./pin-image-proxy.js";
import type { PinterestBulkRow } from "./pinterest-bulk.js";

function escapeXml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

async function main(): Promise<void> {
  const outputDir = path.resolve("output");
  const canonical = validatePinImageManifest(JSON.parse(await readFile("config/pin-images.json", "utf8")));
  const identities = canonicalPinIdentities(canonical, "philippines");
  const history = validatePinImageHistory(JSON.parse(await readFile("config/pin-image-history.json", "utf8")));
  const historicalUrls = new Set(history.images.filter((entry) => entry.firstSeenCommit !== "v2").map((entry) => `https://travel.stampdup.com/pins/${entry.campaign}/${entry.filename}`));
  const rows = csvRecords(await readFile(path.join(outputDir, "stampdup-philippines-pinterest-v2-schedule.csv"), "utf8")) as PinterestBulkRow[];
  const results = await verifyProductionPinImages(identities, rows, historicalUrls);
  await writeFile(path.join(outputDir, "stampdup-philippines-v2-preflight.md"), productionVerificationMarkdown(results));

  const cardWidth = 340, cardHeight = 510, columns = 4, gap = 20, margin = 30;
  const cards: Buffer[] = [];
  for (const result of results) {
    const image = await sharp(result.productionBytes).resize(260, 390, { fit: "contain", background: "#fffaf0" }).png().toBuffer();
    const filename = new URL(result.mediaUrl).pathname.split("/").pop()!;
    const label = Buffer.from(`<svg width="${cardWidth}" height="${cardHeight}"><rect width="100%" height="100%" rx="12" fill="#fffaf0" stroke="#d7b24a" stroke-width="2"/><text x="18" y="420" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#173f35">${escapeXml(result.pinId)} · ${escapeXml(result.canonicalTitle.slice(0, 28))}</text><text x="18" y="448" font-family="Arial,sans-serif" font-size="14" fill="#173f35">${escapeXml(result.canonicalTitle.slice(28, 68))}</text><text x="18" y="480" font-family="Arial,sans-serif" font-size="12" fill="#5b675f">${escapeXml(filename)}</text></svg>`);
    cards.push(await sharp({ create: { width: cardWidth, height: cardHeight, channels: 4, background: "#fffaf0" } }).composite([{ input: image, left: 40, top: 15 }, { input: label, left: 0, top: 0 }]).png().toBuffer());
  }
  const rowsCount = Math.ceil(cards.length / columns);
  const sheetWidth = margin * 2 + columns * cardWidth + (columns - 1) * gap;
  const sheetHeight = margin * 2 + rowsCount * cardHeight + (rowsCount - 1) * gap;
  await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 4, background: "#f6efdF" } }).composite(cards.map((input, index) => ({ input, left: margin + (index % columns) * (cardWidth + gap), top: margin + Math.floor(index / columns) * (cardHeight + gap) }))).png().toFile(path.join(outputDir, "stampdup-philippines-v2-visual-preflight.png"));
  console.log(`Verified ${results.length} live v2 images and wrote the production preflight report and contact sheet.`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
