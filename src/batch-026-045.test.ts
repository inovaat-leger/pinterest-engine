import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canonicalPinIdentities, validateCanonicalImageHistory, validatePinImageHistory, validatePinImageManifest } from "./pin-image-proxy.js";

test("Pins #26–#45 have one immutable canonical identity and approved Drive artwork", () => {
  const batch = JSON.parse(readFileSync("config/pin-batch-026-045.json", "utf8")).pins as Array<{ id: number; title: string; filename: string; altText: string }>;
  const approved = JSON.parse(readFileSync("config/pin-approved-drive-026-045.json", "utf8")).pins as Array<{ pinId:string; filename:string; sourceFilename:string; driveFileId:string; sha256:string }>;
  const manifest = validatePinImageManifest(JSON.parse(readFileSync("config/pin-images.json", "utf8")));
  const history = validatePinImageHistory(JSON.parse(readFileSync("config/pin-image-history.json", "utf8")));
  validateCanonicalImageHistory(manifest, history);
  const identities = canonicalPinIdentities(manifest, "philippines").filter(({ pinId }) => Number(pinId.slice(4)) >= 26);

  assert.equal(batch.length, 20);
  assert.equal(identities.length, 20);
  assert.equal(new Set(batch.map(({ title }) => title)).size, 20);
  assert.equal(new Set(batch.map(({ filename }) => filename)).size, 20);

  for (const [index, pin] of batch.entries()) {
    const expectedId = `pin_${String(index + 26).padStart(3, "0")}`;
    const identity = identities[index];
    assert.equal(pin.id, index + 26);
    assert.equal(identity.pinId, expectedId);
    assert.equal(identity.canonicalTitle, pin.title);
    assert.equal(identity.filename, pin.filename);
    assert.equal(identity.altText, pin.altText);
    assert.match(identity.filename, new RegExp(`^pin-${String(index + 26).padStart(3, "0")}-[a-z0-9-]+-v[2-9][0-9]*\\.png$`));
    assert.equal(identity.driveFileId, approved[index].driveFileId);
    assert.equal(identity.sourceFilename, approved[index].sourceFilename);
    assert.equal(identity.sha256, approved[index].sha256);
    assert.equal(identity.filename, approved[index].filename);
    assert.equal(identity.localPath, undefined);
    const lock = history.images.find(({ campaign, filename }) => campaign === "philippines" && filename === identity.filename);
    assert.equal(lock?.sha256, identity.sha256);
    assert.equal(lock?.driveFileId, identity.driveFileId);
    const retiredV1 = history.images.find(({ campaign, filename }) => campaign === "philippines" && filename === identity.filename.replace(/-v[2-9][0-9]*\.png$/, "-v1.png"));
    assert.ok(retiredV1, `${expectedId} retired v1 route must remain immutable and available.`);
  }

  assert.equal(new Set(identities.map(({ sha256: value }) => value)).size, 20);
});

test("Pins #26–#45 redesign uses approved templates and contains no public placeholders or internal labels", () => {
  const redesign = JSON.parse(readFileSync("config/pin-redesign-026-045.json", "utf8")).pins as Array<{ id:number; template:string; kicker:string; items:string[] }>;
  const allowed = new Set(["01-hero-photo-headline", "02-numbered-checklist", "03-mistakes-warning", "04-side-by-side-comparison", "05-timeline-steps", "06-packing-flat-lay", "07-safety-alert", "08-quick-reference-card"]);
  const prohibited = /(?:\bPIN\s*(?:2[6-9]|3[0-9]|4[0-5])\b|pin_0(?:2[6-9]|3[0-9]|4[0-5])|DESTINATION PHOTO|CHECKLIST ITEM|OPTION [AB]|FIRST DETAIL|SUPPORTING PHOTO|production note)/i;
  assert.equal(redesign.length, 20);
  assert.ok(new Set(redesign.map(({ template }) => template)).size >= 7);
  for (const [index, pin] of redesign.entries()) {
    assert.equal(pin.id, index + 26);
    assert.ok(allowed.has(pin.template));
    assert.ok(!prohibited.test([pin.kicker, ...pin.items].join(" ")));
    assert.ok(readFileSync(`templates/stampdup-travel/stampdup-pinterest-template-kit/editable-svg/${pin.template}.svg`, "utf8").includes('width="1000" height="1500"'));
  }
});
