#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { csvRecords, rowsToCsv } from "./csv.js";
import { canonicalPinIdentities, validatePinImageHistory, validatePinImageManifest } from "./pin-image-proxy.js";
import type { PinterestBulkRow } from "./pinterest-bulk.js";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const png = (bytes: Buffer) => bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

async function main(): Promise<void> {
  const outputDir = path.resolve("output");
  const batch = JSON.parse(await readFile("config/pin-batch-026-045.json", "utf8")).pins as Array<Record<string, any>>;
  const canonical = canonicalPinIdentities(validatePinImageManifest(JSON.parse(await readFile("config/pin-images.json", "utf8"))), "philippines").filter((identity) => Number(identity.pinId.slice(4)) >= 26);
  const history = validatePinImageHistory(JSON.parse(await readFile("config/pin-image-history.json", "utf8")));
  const priorUrls = new Set(history.images.filter((entry) => entry.firstSeenCommit !== "batch-026-045-v1").map((entry) => `https://travel.stampdup.com/pins/${entry.campaign}/${entry.filename}`));
  const csvPath = path.join(outputDir, "stampdup-philippines-pins-026-045.csv");
  const rows = csvRecords(await readFile(csvPath, "utf8")) as PinterestBulkRow[];
  if (canonical.length !== 20 || rows.length !== 20 || batch.length !== 20) throw new Error("Batch verification requires exactly Pins #26–#45 and 20 CSV rows.");

  type VerificationRecord = {
    pinId: string; title: string; overlay: string; filename: string; source: string;
    mediaUrl: string; imageSha: string; productionSha: string; exact: string;
    board: string; link: string; utm: string; altText: string; local: string;
    exported: string; result: string; bytes: Buffer;
  };
  const records: VerificationRecord[] = [];
  const seenHashes = new Set<string>();
  for (const [index, identity] of canonical.entries()) {
    const pin = batch[index], row = rows[index], expectedId = `pin_${String(index + 26).padStart(3, "0")}`;
    const mediaUrl = `https://travel.stampdup.com/pins/${identity.campaign}/${identity.filename}`;
    if (identity.pinId !== expectedId || row.Title !== identity.canonicalTitle || row["Media URL"] !== mediaUrl || priorUrls.has(mediaUrl) || !mediaUrl.endsWith("-v1.png")) throw new Error(`${expectedId} has an invalid or previously used canonical Media URL identity.`);
    const utm = new URL(row.Link).searchParams.get("utm_content") ?? "";
    if (utm !== expectedId || row["Pinterest board"] !== pin.board || row.Description !== pin.description || !row.Keywords.trim() || row.Title.length > 100 || row.Description.length > 500) throw new Error(`${expectedId} CSV metadata, limits, or UTM disagrees with canonical data.`);
    const localBytes = await readFile(identity.localPath!);
    const response = await fetch(mediaUrl, { redirect: "manual", credentials: "omit", headers: { Accept: "image/png", "Cache-Control": "no-cache", Pragma: "no-cache" } });
    const productionBytes = Buffer.from(await response.arrayBuffer());
    const localSha = hash(localBytes), productionSha = hash(productionBytes), contentType = response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() ?? "";
    const metadata = await sharp(productionBytes).metadata();
    if (response.status !== 200 || response.url !== mediaUrl || contentType !== "image/png" || !png(productionBytes) || metadata.width !== 1000 || metadata.height !== 1500 || localSha !== identity.sha256 || productionSha !== identity.sha256 || !localBytes.equals(productionBytes)) throw new Error(`${expectedId} live production bytes failed exact image verification.`);
    if (seenHashes.has(productionSha)) throw new Error(`${expectedId} duplicates another image hash.`); seenHashes.add(productionSha);
    const day = Math.floor(index / 4), slot = index % 4, times = ["07:00", "12:00", "16:00", "20:00"], local = `${addDays("2026-08-17", day)} ${times[slot]} America/Chicago`;
    const exported = row["Publish date"] || "IMMEDIATE";
    if (day === 0 ? exported !== "IMMEDIATE" : !exported) throw new Error(`${expectedId} has invalid immediate/scheduled behavior.`);
    records.push({ pinId: expectedId, title: identity.canonicalTitle, overlay: pin.overlayText.replace("\n", " / "), filename: identity.filename, source: identity.localPath!, mediaUrl, imageSha: localSha, productionSha, exact: "YES", board: row["Pinterest board"], link: row.Link, utm, altText: identity.altText, local, exported, result: "PASS", bytes: productionBytes });
  }

  const lines = ["# StampdUp Philippines Pins #26–#45 production preflight", "", "All image bytes were fetched from the live public Media URLs and compared exactly with the approved finished artwork.", "", "| Pin ID | Canonical title | Overlay text | Artwork filename | Source | Public Media URL | Image SHA-256 | Production SHA-256 | Exact bytes | Board | Destination Link | UTM | ALT text | Local schedule | Exported UTC | Result |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const record of records) lines.push(`| ${record.pinId} | ${record.title.replaceAll("|", "\\|")} | ${record.overlay} | ${record.filename} | ${record.source} | ${record.mediaUrl} | ${record.imageSha} | ${record.productionSha} | ${record.exact} | ${record.board} | ${record.link} | ${record.utm} | ${record.altText.replaceAll("|", "\\|")} | ${record.local} | ${record.exported} | ${record.result} |`);
  await writeFile(path.join(outputDir, "stampdup-philippines-pins-026-045-preflight.md"), `${lines.join("\n")}\n`);

  const cards: Buffer[] = [], cardWidth = 340, cardHeight = 540;
  for (const record of records) {
    const image = await sharp(record.bytes).resize(260, 390).png().toBuffer();
    const label = Buffer.from(`<svg width="340" height="540"><rect width="340" height="540" rx="12" fill="#fffaf0" stroke="#d7b24a" stroke-width="2"/><text x="18" y="425" font-family="Arial" font-size="14" font-weight="700" fill="#083f32">${xml(record.pinId)} · ${xml(record.title.slice(0, 35))}</text><text x="18" y="447" font-family="Arial" font-size="13" fill="#083f32">${xml(record.title.slice(35, 78))}</text><text x="18" y="490" font-family="Arial" font-size="10" fill="#52655e">${xml(record.filename.slice(0, 48))}</text><text x="18" y="506" font-family="Arial" font-size="10" fill="#52655e">${xml(record.filename.slice(48))}</text></svg>`);
    cards.push(await sharp({ create: { width: cardWidth, height: cardHeight, channels: 4, background: "#fffaf0" } }).composite([{ input: label }, { input: image, left: 40, top: 15 }]).png().toBuffer());
  }
  await sharp({ create: { width: 1480, height: 2840, channels: 4, background: "#f6efdf" } }).composite(cards.map((input, index) => ({ input, left: 30 + (index % 4) * 360, top: 30 + Math.floor(index / 4) * 560 }))).png().toFile(path.join(outputDir, "stampdup-philippines-pins-026-045-visual-preflight.png"));

  const registryHeader = ["pin_id", "canonical_title", "overlay_text", "artwork_filename", "public_media_url", "alt_text", "board", "destination_link", "scheduled_local", "exported_utc", "status"];
  await writeFile(path.join(outputDir, "stampdup-philippines-pins-026-045-registry.csv"), rowsToCsv([registryHeader, ...records.map((record) => [record.pinId, record.title, record.overlay, record.filename, record.mediaUrl, record.altText, record.board, record.link, record.local, record.exported, "created"])]));
  console.log("Verified 20 live Pins #26–#45 and wrote technical, visual, and Registry preflight outputs.");
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
