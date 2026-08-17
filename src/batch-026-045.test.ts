import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import sharp from "sharp";
import { canonicalPinIdentities, validateCanonicalImageHistory, validatePinImageHistory, validatePinImageManifest } from "./pin-image-proxy.js";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("Pins #26–#45 have one immutable canonical identity and approved finished artwork", async () => {
  const batch = JSON.parse(readFileSync("config/pin-batch-026-045.json", "utf8")).pins as Array<{ id: number; title: string; filename: string; altText: string }>;
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
    assert.match(identity.filename, new RegExp(`^pin-${String(index + 26).padStart(3, "0")}-[a-z0-9-]+-v1\\.png$`));
    assert.ok(identity.localPath);
    const bytes = readFileSync(identity.localPath!);
    const metadata = await sharp(bytes).metadata();
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(metadata.width, 1000);
    assert.equal(metadata.height, 1500);
    assert.equal(sha256(bytes), identity.sha256);
    const lock = history.images.find(({ campaign, filename }) => campaign === "philippines" && filename === identity.filename);
    assert.equal(lock?.sha256, identity.sha256);
    assert.equal(lock?.localPath, identity.localPath);
  }

  assert.equal(new Set(identities.map(({ sha256: value }) => value)).size, 20);
});
