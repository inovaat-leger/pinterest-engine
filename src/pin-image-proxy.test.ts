import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { canonicalPinIdentities, validatePinImageManifest } from "./pin-image-proxy.js";

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

test("approved Philippines Pin IDs retain their exact registry artwork and canonical titles", () => {
  const manifest = validatePinImageManifest(JSON.parse(readFileSync("config/pin-images.json", "utf8")));
  const identities = canonicalPinIdentities(manifest, "philippines");
  const expected = [
    ["pin_002", "Manila Airport to Your Hotel: Know Your Options", "Pin2-5.png"],
    ["pin_003", "The Philippines Travel Checklist People Forget", "Pin2-5b.png"],
    ["pin_004", "Your First 72 Hours in the Philippines", "Pin2-5c.png"],
    ["pin_005", "Philippines Cash and ATM Prep Before You Land", "Pin2-5d.png"],
    ["pin_006", "Land in Manila Connected", "Land in Manila Connected.png"],
    ["pin_007", "Set Up Your eSIM Before Takeoff", "Set Up Your eSIM Before Takeoff.png"],
    ["pin_008", "First Time at Manila Airport?", "First Time at Manila Airport.png"],
    ["pin_009", "Physical SIM or eSIM?", "Physical SIM or eSIM.png"],
    ["pin_010", "Your Connected First 24 Hours in Manila", "Your Connected First 24 Hours in Manila.png"],
    ["pin_011", "How Much Mobile Data Do You Need?", "How Much Mobile Data Do You Need.png"],
    ["pin_012", "9 Philippines Arrival Mistakes to Avoid", "pin_012-philippines-arrival-mistakes.png"],
    ["pin_013", "A Digital Nomad’s Philippines Connectivity Plan", "pin_013-digital-nomad-connectivity-plan.png"],
    ["pin_014", "Your Backup Internet Plan for Remote Work", "pin_014-backup-internet-remote-work.png"],
    ["pin_015", "Can You Keep Your Home Number With an eSIM?", "pin_015-keep-home-number-with-esim.png"],
    ["pin_016", "Is Your Phone Ready for a Philippines eSIM?", "pin_016-phone-ready-philippines-esim.png"],
    ["pin_017", "Don’t Make These 5 eSIM Setup Mistakes", "pin_017-esim-setup-mistakes.png"],
    ["pin_018", "When Should You Activate a Philippines eSIM?", "pin_018-esim-activation-timing.png"],
    ["pin_019", "Save This Offline Before Flying to Manila", "pin_019-save-offline-before-manila.png"],
    ["pin_020", "Essential Apps for Your First Philippines Trip", "pin_020-essential-apps-first-philippines-trip.png"],
    ["pin_021", "Why Airport Wi-Fi Shouldn’t Be Your Only Plan", "pin_021-airport-wifi-not-only-plan.png"],
    ["pin_022", "Philippines Plug & Charging Prep", "pin_022-philippines-plug-voltage-charging-prep.png"],
    ["pin_023", "The Smart Way to Use Maps Without Burning Data", "pin_023-maps-without-burning-data.png"],
    ["pin_024", "Save These Philippines Emergency Contacts", "pin_024-philippines-emergency-contacts.png"],
    ["pin_025", "Your First Manila Ride: 5 Pickup Checks", "pin_025-first-manila-ride-pickup-checks.png"],
  ];
  assert.equal(identities.length, 24);
  for (const [index, identity] of identities.entries()) {
    const [pinId, title, source] = expected[index];
    assert.equal(identity.pinId, pinId);
    assert.equal(identity.canonicalTitle, title);
    assert.equal(identity.sourceFilename, source);
  }
});
