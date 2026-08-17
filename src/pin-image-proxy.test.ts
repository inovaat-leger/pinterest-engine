import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePinImageManifest } from "./pin-image-proxy.js";

test("Pin image manifest accepts only explicit unique Google Drive mappings", () => {
  assert.doesNotThrow(() => validatePinImageManifest({ schemaVersion: 1, images: [{ campaign: "philippines", filename: "pin-012.png", driveFileId: "approvedFile123" }] }));
  assert.doesNotThrow(() => validatePinImageManifest({ schemaVersion: 1, images: [{ campaign: "philippines", filename: "pin-012.jpg", sourceUrl: "https://drive.google.com/file/d/approvedFile123/view" }] }));
  assert.throws(() => validatePinImageManifest({ schemaVersion: 1, images: [{ campaign: "philippines", filename: "pin.png", sourceUrl: "https://example.com/image.png" }] }), /supported Google Drive URL/);
  assert.throws(() => validatePinImageManifest({ schemaVersion: 1, images: [
    { campaign: "philippines", filename: "pin.png", driveFileId: "approvedFile123" },
    { campaign: "philippines", filename: "pin.png", driveFileId: "approvedFile456" },
  ] }), /Duplicate/);
  assert.throws(() => validatePinImageManifest({ schemaVersion: 1, images: [{ campaign: "../private", filename: "pin.png", driveFileId: "approvedFile123" }] }), /invalid campaign/);
});
