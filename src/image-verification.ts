import { createHash } from "node:crypto";
import type { CanonicalPinIdentity } from "./experiment.js";
import type { PinterestBulkRow } from "./pinterest-bulk.js";

export type ProductionImageVerification = {
  pinId: string;
  canonicalTitle: string;
  driveFileId: string;
  mediaUrl: string;
  driveSha256: string;
  productionSha256: string;
  exactByteMatch: true;
  utmContent: string;
  publishDate: string;
  productionBytes: Buffer;
};

function digest(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
function png(bytes: Buffer): boolean { return bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"; }

export async function verifyProductionPinImages(
  identities: CanonicalPinIdentity[],
  rows: PinterestBulkRow[],
  historicalUrls: Set<string>,
  fetchImpl: typeof fetch = fetch,
): Promise<ProductionImageVerification[]> {
  const selected = identities.filter((identity) => Number(identity.pinId.slice(4)) >= 6);
  if (selected.length !== 20 || rows.length !== 20) throw new Error("V2 production verification requires exactly Pins #6–#25 and 20 CSV rows.");
  const results: ProductionImageVerification[] = [];
  for (const [index, identity] of selected.entries()) {
    const row = rows[index];
    const expectedUrl = `https://travel.stampdup.com/pins/${identity.campaign}/${identity.filename}`;
    if (!identity.filename.endsWith("-v2.png") || row["Media URL"] !== expectedUrl || historicalUrls.has(expectedUrl)) throw new Error(`${identity.pinId} does not use a new, uncontaminated v2 Media URL.`);
    if (row.Title !== identity.canonicalTitle) throw new Error(`${identity.pinId} CSV title disagrees with the canonical title.`);
    const utmContent = new URL(row.Link).searchParams.get("utm_content") ?? "";
    if (utmContent !== identity.pinId) throw new Error(`${identity.pinId} CSV UTM content disagrees with the canonical identity.`);
    if (!identity.driveFileId) throw new Error(`${identity.pinId} does not use the Drive-backed v2 workflow.`);
    const [driveResponse, productionResponse] = await Promise.all([
      fetchImpl(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(identity.driveFileId)}&export=download&confirm=t`, { headers: { Accept: "image/png" } }),
      fetchImpl(expectedUrl, { headers: { Accept: "image/png", "Cache-Control": "no-cache", Pragma: "no-cache" }, credentials: "omit" }),
    ]);
    const driveBytes = Buffer.from(await driveResponse.arrayBuffer());
    const productionBytes = Buffer.from(await productionResponse.arrayBuffer());
    const driveSha256 = digest(driveBytes);
    const productionSha256 = digest(productionBytes);
    const contentType = productionResponse.headers.get("content-type")?.split(";", 1)[0].toLowerCase();
    if (!driveResponse.ok || !productionResponse.ok || contentType !== "image/png" || !png(driveBytes) || !png(productionBytes)) throw new Error(`${identity.pinId} did not return valid production and Drive PNG responses.`);
    if (driveSha256 !== identity.sha256 || productionSha256 !== identity.sha256 || !driveBytes.equals(productionBytes)) throw new Error(`${identity.pinId} production bytes do not exactly match the locked approved Drive bytes.`);
    results.push({ pinId: identity.pinId, canonicalTitle: identity.canonicalTitle, driveFileId: identity.driveFileId, mediaUrl: expectedUrl, driveSha256, productionSha256, exactByteMatch: true, utmContent, publishDate: row["Publish date"], productionBytes });
  }
  return results;
}

function localDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(`${value}Z`));
  const part = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute} America/Chicago`;
}

export function productionVerificationMarkdown(results: ProductionImageVerification[]): string {
  const lines = [
    "# StampdUp Philippines v2 production preflight",
    "",
    "All bytes in this report were fetched from the live production v2 URLs and compared with the approved Google Drive files.",
    "",
    "| Pin ID | Canonical title | Drive file ID | Versioned Media URL | Drive SHA-256 | Production SHA-256 | Exact bytes | UTM content ID | Schedule | Result |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const result of results) lines.push(`| ${result.pinId} | ${result.canonicalTitle.replaceAll("|", "\\|")} | ${result.driveFileId} | ${result.mediaUrl} | ${result.driveSha256} | ${result.productionSha256} | YES | ${result.utmContent} | ${localDateTime(result.publishDate)} | PASS |`);
  return `${lines.join("\n")}\n`;
}
