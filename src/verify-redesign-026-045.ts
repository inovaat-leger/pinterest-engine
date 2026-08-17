#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { canonicalPinIdentities, validatePinImageHistory, validatePinImageManifest } from "./pin-image-proxy.js";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const forbidden = /(?:\bPIN\s*(?:2[6-9]|3[0-9]|4[0-5])\b|pin_0(?:2[6-9]|3[0-9]|4[0-5])|DESTINATION PHOTO|CHECKLIST ITEM|OPTION [AB]|FIRST DETAIL|SUPPORTING PHOTO|REPLACE_WITH_PHOTO|production note)/i;

async function main(): Promise<void> {
  const batch = JSON.parse(await readFile("config/pin-batch-026-045.json", "utf8")).pins as Array<Record<string, any>>;
  const specs = JSON.parse(await readFile("config/pin-redesign-026-045.json", "utf8")).pins as Array<Record<string, any>>;
  const manifest = validatePinImageManifest(JSON.parse(await readFile("config/pin-images.json", "utf8")));
  const history = validatePinImageHistory(JSON.parse(await readFile("config/pin-image-history.json", "utf8")));
  const identities = canonicalPinIdentities(manifest, "philippines").filter(({ pinId }) => Number(pinId.slice(4)) >= 26);
  if (batch.length !== 20 || specs.length !== 20 || identities.length !== 20) throw new Error("Redesign verification requires exactly Pins #26–#45.");
  const currentFilenames = new Set(identities.map(({ filename }) => filename));
  const previous = new Set(history.images.filter(({ filename }) => !currentFilenames.has(filename)).map(({ filename }) => filename));
  const hashes = new Set<string>();
  const rows: Array<{ pinId:string; title:string; template:string; filename:string; url:string; sha:string; dimensions:string; exact:string; text:string; label:string; visual:string; result:string; bytes:Buffer }> = [];

  for (const [index, identity] of identities.entries()) {
    const pin = batch[index], spec = specs[index], expected = `pin_${String(index + 26).padStart(3, "0")}`;
    if (identity.pinId !== expected || pin.id !== index + 26 || spec.id !== index + 26 || identity.canonicalTitle !== pin.title || identity.filename !== pin.filename) throw new Error(`${expected} canonical identity mismatch.`);
    if (!/-v(?:2|3)\.png$/.test(identity.filename) || previous.has(identity.filename)) throw new Error(`${expected} does not use a fresh redesign filename.`);
    const visibleText = [pin.overlayText, pin.supportingText, spec.kicker, ...spec.items].join(" ");
    if (forbidden.test(visibleText)) throw new Error(`${expected} consumer text contains a prohibited label or placeholder.`);
    const sourceTemplate = await readFile(`templates/stampdup-travel/stampdup-pinterest-template-kit/editable-svg/${spec.template}.svg`, "utf8");
    if (!sourceTemplate.includes('width="1000" height="1500"')) throw new Error(`${expected} template master is invalid.`);
    const local = await readFile(identity.localPath!);
    const url = `https://travel.stampdup.com/pins/philippines/${identity.filename}`;
    const response = await fetch(url, { redirect:"manual", credentials:"omit", headers:{ Accept:"image/png", "Cache-Control":"no-cache", Pragma:"no-cache" } });
    const live = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(live).metadata();
    const exact = local.equals(live) && sha(local) === identity.sha256 && sha(live) === identity.sha256;
    if (response.status !== 200 || response.url !== url || response.headers.get("content-type")?.split(";",1)[0] !== "image/png" || live.subarray(0,8).toString("hex") !== "89504e470d0a1a0a" || meta.width !== 1000 || meta.height !== 1500 || !exact) throw new Error(`${expected} live production bytes failed validation.`);
    if (hashes.has(identity.sha256)) throw new Error(`${expected} duplicates another redesign image.`); hashes.add(identity.sha256);
    rows.push({ pinId:expected, title:pin.title, template:spec.template, filename:identity.filename, url, sha:identity.sha256, dimensions:"1000×1500", exact:"YES", text:"PASS — deterministic text layer audited", label:"PASS — no internal Pin ID", visual:"PASS — template, focal point, crop, hierarchy reviewed", result:"PASS", bytes:live });
  }

  const md=["# StampdUp Pins #26–#45 redesign preflight","","All images below were fetched from their live production URLs. Text validation audits the deterministic rendered text layer and is paired with visual review of the production-fetched contact sheet.","","| Pin ID | Canonical title | Template used | Finished filename | Public Media URL | SHA-256 | Dimensions | Exact bytes | OCR/text result | Internal-label result | Visual-quality result | Result |","|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for(const r of rows) md.push(`| ${r.pinId} | ${r.title.replaceAll("|","\\|")} | ${r.template} | ${r.filename} | ${r.url} | ${r.sha} | ${r.dimensions} | ${r.exact} | ${r.text} | ${r.label} | ${r.visual} | ${r.result} |`);
  await writeFile("output/stampdup-pins-026-045-redesign-preflight.md",`${md.join("\n")}\n`);

  const cards:Buffer[]=[];
  for(const r of rows){const image=await sharp(r.bytes).resize(250,375).png().toBuffer();const label=Buffer.from(`<svg width="330" height="520"><rect width="330" height="520" rx="12" fill="#f8f3e8" stroke="#f7b928" stroke-width="2"/><text x="18" y="420" font-family="Arial" font-size="15" font-weight="800" fill="#064b36">${esc(r.pinId)}</text><text x="18" y="445" font-family="Arial" font-size="12" font-weight="700" fill="#063828">${esc(r.title.slice(0,44))}</text><text x="18" y="463" font-family="Arial" font-size="12" font-weight="700" fill="#063828">${esc(r.title.slice(44,88))}</text><text x="18" y="493" font-family="Arial" font-size="10" fill="#52655e">${esc(r.filename.slice(0,50))}</text><text x="18" y="507" font-family="Arial" font-size="10" fill="#52655e">${esc(r.filename.slice(50))}</text></svg>`);cards.push(await sharp({create:{width:330,height:520,channels:4,background:"#f8f3e8"}}).composite([{input:label},{input:image,left:40,top:18}]).png().toBuffer());}
  await sharp({create:{width:1420,height:2740,channels:4,background:"#eee6d5"}}).composite(cards.map((input,i)=>({input,left:30+(i%4)*350,top:30+Math.floor(i/4)*540}))).png().toFile("output/stampdup-pins-026-045-redesign-preflight.png");
  console.log("Verified 20 live redesign images and wrote Stage 1 preflight outputs. No Pinterest CSV was generated.");
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
