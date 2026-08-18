#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { csvRecords, parseCsv } from "./csv.js";
import { canonicalPinIdentities, validatePinImageHistory, validatePinImageManifest } from "./pin-image-proxy.js";
import { localTimeToPinterestUtc, pinterestBulkHeaders, type PinterestBulkRow } from "./pinterest-bulk.js";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const png = (bytes: Buffer) => bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

async function main(): Promise<void> {
  const csvPath = "output/stampdup-philippines-pinterest-schedule-2026-08-22.csv";
  const csv = await readFile(csvPath, "utf8");
  if (JSON.stringify(parseCsv(csv)[0]) !== JSON.stringify([...pinterestBulkHeaders])) throw new Error("Pinterest CSV headers are not exact or correctly ordered.");
  const rows = csvRecords(csv) as PinterestBulkRow[];
  const batch = JSON.parse(await readFile("config/pin-batch-026-045.json", "utf8")).pins as Array<Record<string, any>>;
  const approved = JSON.parse(await readFile("config/pin-approved-drive-026-045.json", "utf8")).pins as Array<Record<string, string>>;
  const manifest = validatePinImageManifest(JSON.parse(await readFile("config/pin-images.json", "utf8")));
  const history = validatePinImageHistory(JSON.parse(await readFile("config/pin-image-history.json", "utf8")));
  const identities = canonicalPinIdentities(manifest, "philippines").filter(({ pinId }) => Number(pinId.slice(4)) >= 26);
  if (rows.length !== 20 || batch.length !== 20 || approved.length !== 20 || identities.length !== 20) throw new Error("Stage 2 requires exactly 20 Pins #26–#45.");
  const times = ["07:00", "10:30", "14:00", "17:30", "21:00"];
  const seenIds = new Set<string>(), seenMedia = new Set<string>(), seenHashes = new Set<string>();
  type Result = { pinId:string; title:string; source:string; driveId:string; filename:string; media:string; driveSha:string; productionSha:string; dimensions:string; exact:string; board:string; link:string; utm:string; alt:string; local:string; utc:string; result:string; bytes:Buffer };
  const results: Result[] = [];

  for (const [index, identity] of identities.entries()) {
    const pin = batch[index], mapping = approved[index], row = rows[index], pinId = `pin_${String(index + 26).padStart(3, "0")}`;
    const localDate = addDays("2026-08-22", Math.floor(index / 5));
    const localTime = times[index % 5];
    const utc = localTimeToPinterestUtc(localDate, localTime, "America/Chicago");
    const media = `https://travel.stampdup.com/pins/philippines/${identity.filename}`;
    if (identity.pinId !== pinId || mapping.pinId !== pinId || pin.id !== index + 26 || seenIds.has(pinId)) throw new Error(`${pinId} identity is missing or duplicated.`); seenIds.add(pinId);
    if (identity.filename !== mapping.filename || identity.driveFileId !== mapping.driveFileId || identity.sha256 !== mapping.sha256 || identity.canonicalTitle !== pin.title) throw new Error(`${pinId} canonical artwork mapping disagrees.`);
    if (row.Title !== pin.title || row["Media URL"] !== media || row["Pinterest board"] !== pin.board || row.Description !== pin.description || row.Keywords !== pin.keywords.join(", ") || row.Thumbnail !== "") throw new Error(`${pinId} CSV metadata disagrees with canonical data.`);
    if (row["Publish date"] !== utc) throw new Error(`${pinId} schedule mismatch: expected ${utc}.`);
    const link = new URL(row.Link), utm = link.searchParams.get("utm_content") ?? "";
    if (link.origin + link.pathname !== "https://travel.stampdup.com/philippines-arrival-kit" || utm !== pinId || link.searchParams.get("utm_source") !== "pinterest" || link.searchParams.get("utm_medium") !== "organic" || link.searchParams.get("utm_campaign") !== "philippines_arrival_kit") throw new Error(`${pinId} destination tracking mismatch.`);
    if (row.Title.length > 100 || row.Description.length > 500 || !row["Pinterest board"] || seenMedia.has(media)) throw new Error(`${pinId} violates Pinterest limits or URL uniqueness.`); seenMedia.add(media);
    const lock = history.images.find((entry) => entry.campaign === "philippines" && entry.filename === identity.filename);
    if (!lock || lock.driveFileId !== identity.driveFileId || lock.sha256 !== identity.sha256 || lock.firstSeenCommit !== "stage2-approved-drive-2026-08-22") throw new Error(`${pinId} immutable route lock mismatch.`);
    const driveUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(identity.driveFileId!)}&export=download&confirm=t`;
    const [driveResponse, productionResponse, diagnosticResponse] = await Promise.all([
      fetch(driveUrl, { headers:{ Accept:"image/png", "Cache-Control":"no-cache" } }),
      fetch(media, { redirect:"manual", credentials:"omit", headers:{ Accept:"image/png", "Cache-Control":"no-cache", Pragma:"no-cache" } }),
      fetch(`https://travel.stampdup.com/health/pins/philippines/${identity.filename}`, { headers:{ "Cache-Control":"no-cache" } }),
    ]);
    const driveBytes = Buffer.from(await driveResponse.arrayBuffer()), productionBytes = Buffer.from(await productionResponse.arrayBuffer());
    const driveSha = hash(driveBytes), productionSha = hash(productionBytes), metadata = await sharp(productionBytes).metadata();
    if (driveResponse.status !== 200 || productionResponse.status !== 200 || productionResponse.url !== media || diagnosticResponse.status !== 200 || productionResponse.headers.get("content-type")?.split(";",1)[0] !== "image/png" || !png(driveBytes) || !png(productionBytes) || metadata.width !== 1000 || metadata.height !== 1500 || driveSha !== mapping.sha256 || productionSha !== mapping.sha256 || !driveBytes.equals(productionBytes)) throw new Error(`${pinId} Drive/production exact-byte verification failed.`);
    if (seenHashes.has(productionSha)) throw new Error(`${pinId} duplicates another approved image.`); seenHashes.add(productionSha);
    results.push({ pinId, title:pin.title, source:mapping.sourceFilename, driveId:mapping.driveFileId, filename:identity.filename, media, driveSha, productionSha, dimensions:"1000×1500", exact:"YES", board:pin.board, link:row.Link, utm, alt:pin.altText, local:`${localDate} ${localTime} America/Chicago`, utc, result:"PASS", bytes:productionBytes });
  }

  const md=["# StampdUp Philippines Pins #26–#45 Stage 2 preflight","","All artwork was fetched directly from the approved Google Drive mapping and from the final live production Media URL. SHA-256 and bytes match exactly.","","| Pin ID | Canonical title | Approved source | Drive file ID | Production filename | Media URL | Drive SHA-256 | Production SHA-256 | Dimensions | Exact bytes | Board | Destination Link | UTM | ALT text | Local schedule | Exported UTC | Result |","|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for(const r of results) md.push(`| ${r.pinId} | ${r.title.replaceAll("|","\\|")} | ${r.source} | ${r.driveId} | ${r.filename} | ${r.media} | ${r.driveSha} | ${r.productionSha} | ${r.dimensions} | ${r.exact} | ${r.board} | ${r.link} | ${r.utm} | ${r.alt.replaceAll("|","\\|")} | ${r.local} | ${r.utc} | ${r.result} |`);
  await writeFile("output/stampdup-philippines-pins-026-045-preflight.md",`${md.join("\n")}\n`);

  const cards:Buffer[]=[];
  for(const r of results){const image=await sharp(r.bytes).resize(250,375).png().toBuffer();const label=Buffer.from(`<svg width="330" height="510"><rect width="330" height="510" rx="12" fill="#f8f3e8" stroke="#f7b928" stroke-width="2"/><text x="18" y="418" font-family="Arial" font-size="15" font-weight="800" fill="#064b36">${esc(r.pinId)}</text><text x="18" y="442" font-family="Arial" font-size="12" font-weight="700" fill="#063828">${esc(r.title.slice(0,44))}</text><text x="18" y="460" font-family="Arial" font-size="12" font-weight="700" fill="#063828">${esc(r.title.slice(44,88))}</text><text x="18" y="489" font-family="Arial" font-size="10" fill="#52655e">${esc(r.filename.slice(0,50))}</text><text x="18" y="503" font-family="Arial" font-size="10" fill="#52655e">${esc(r.filename.slice(50))}</text></svg>`);cards.push(await sharp({create:{width:330,height:510,channels:4,background:"#f8f3e8"}}).composite([{input:label},{input:image,left:40,top:18}]).png().toBuffer());}
  await sharp({create:{width:1420,height:2690,channels:4,background:"#eee6d5"}}).composite(cards.map((input,i)=>({input,left:30+(i%4)*350,top:30+Math.floor(i/4)*530}))).png().toFile("output/stampdup-philippines-pins-026-045-visual-preflight.png");
  console.log("Verified 20 approved Drive images, live immutable routes, diagnostics, metadata, and schedule rows.");
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
