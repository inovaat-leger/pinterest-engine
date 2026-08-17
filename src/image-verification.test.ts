import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CanonicalPinIdentity } from "./experiment.js";
import { verifyProductionPinImages } from "./image-verification.js";
import type { PinterestBulkRow } from "./pinterest-bulk.js";

const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("approved bytes")]);
const sha256 = createHash("sha256").update(png).digest("hex");
const identities: CanonicalPinIdentity[] = Array.from({ length: 20 }, (_, index) => {
  const number = index + 6, pinId = `pin_${String(number).padStart(3, "0")}`;
  return { pinId, sourceConceptId: number, canonicalTitle: `Title ${number}`, campaign: "philippines", filename: `title-${number}-v2.png`, sourceFilename: `source-${number}.png`, driveFileId: `approvedDrive${number}`, altText: `ALT ${number}`, sha256 };
});
const rows: PinterestBulkRow[] = identities.map((identity, index) => ({ Title: identity.canonicalTitle, "Media URL": `https://travel.stampdup.com/pins/philippines/${identity.filename}`, "Pinterest board": "Board", Thumbnail: "", Description: "Description", Link: `https://travel.stampdup.com/philippines-arrival-kit?utm_content=${identity.pinId}`, "Publish date": `2026-08-${String(22 + Math.floor(index / 5)).padStart(2, "0")}T13:00:00`, Keywords: "keyword" }));

test("production verifier requires exact approved Drive and production bytes", async () => {
  const fetchImpl: typeof fetch = async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } });
  const results = await verifyProductionPinImages(identities, rows, new Set(), fetchImpl);
  assert.equal(results.length, 20);
  assert.ok(results.every((result) => result.exactByteMatch && result.driveSha256 === result.productionSha256));
});

test("production verifier rejects contaminated URLs and byte mismatches", async () => {
  const contaminated = new Set([rows[0]["Media URL"]]);
  await assert.rejects(() => verifyProductionPinImages(identities, rows, contaminated, async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } })), /uncontaminated/);
  let request = 0;
  const mismatchedFetch: typeof fetch = async () => new Response(request++ % 2 ? Buffer.concat([png, Buffer.from("wrong")]) : png, { status: 200, headers: { "content-type": "image/png" } });
  await assert.rejects(() => verifyProductionPinImages(identities, rows, new Set(), mismatchedFetch), /exactly match/);
});
