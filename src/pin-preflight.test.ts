import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildExperimentPins, type CampaignConfig, type SourcePin } from "./experiment.js";
import { canonicalPinIdentities, validatePinImageManifest } from "./pin-image-proxy.js";
import { validateCanonicalBulkIdentity } from "./pin-preflight.js";
import { createPinterestBulkRows, resolvePinterestBulkSchedule } from "./pinterest-bulk.js";

const includePinIds = Array.from({ length: 20 }, (_, index) => `pin_${String(index + 6).padStart(3, "0")}`);
const config: CampaignConfig = {
  name: "Philippines Arrival Kit", brand: "StampdUp Travel", audience: "travelers", goal: "arrival planning",
  destinationUrl: "https://travel.stampdup.com/philippines-arrival-kit", keywords: ["Philippines travel"], boards: ["Philippines Travel Tips"], pinCount: 25,
  campaignId: "philippines_arrival_kit", publicImageCampaignSlug: "philippines", callToAction: "Get the free arrival checklist",
  experiment: { id: "experiment", startDate: "2026-08-17", timezone: "America/Chicago", publicationTime: "09:00:00-05:00", utmCampaign: "philippines_arrival_kit" },
  pinterestBulkSchedule: { startDate: "2026-08-22", timezone: "America/Chicago", dailyTimes: ["08:00", "11:00", "14:00", "17:00", "20:00"], pinsPerDay: 5, includePinIds },
};

function fixture() {
  const identities = canonicalPinIdentities(validatePinImageManifest(JSON.parse(readFileSync("config/pin-images.json", "utf8"))), "philippines");
  const sources: SourcePin[] = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, board: "Philippines Travel Tips", title: `Source ${index + 1}`, description: `Description ${index + 1}.`, destinationUrl: config.destinationUrl, creativeBrief: `Overlay: “SOURCE ${index + 1}”`, keywords: ["Philippines travel"] }));
  const pins = buildExperimentPins(config, sources, identities);
  const schedule = resolvePinterestBulkSchedule(config);
  const rows = createPinterestBulkRows(pins, config, schedule);
  return { identities, pins, schedule, rows };
}

test("canonical preflight binds title, artwork, Media URL, UTM, and schedule to each Pin ID", () => {
  const { identities, pins, schedule, rows } = fixture();
  const report = validateCanonicalBulkIdentity(pins, identities, rows, schedule);
  assert.equal(report.length, 20);
  assert.deepEqual(report.map((row) => row.pinId), includePinIds);
  assert.ok(report.every((row) => row.validation === "PASS" && row.utmContent === row.pinId));
  assert.ok(report.every((row) => new URL(row.mediaUrl).pathname.endsWith("-v2.png")));
});

test("canonical preflight rejects missing mappings and identity disagreements", () => {
  const { identities, pins, schedule, rows } = fixture();
  assert.throws(() => validateCanonicalBulkIdentity(pins, identities.filter((identity) => identity.pinId !== "pin_011"), rows, schedule), /pin_011 is missing/);
  const badTitle = rows.map((row) => ({ ...row })); badTitle[0].Title = "Wrong title";
  assert.throws(() => validateCanonicalBulkIdentity(pins, identities, badTitle, schedule), /generated title/);
  const badMedia = rows.map((row) => ({ ...row })); badMedia[1]["Media URL"] = rows[2]["Media URL"];
  assert.throws(() => validateCanonicalBulkIdentity(pins, identities, badMedia, schedule), /Media URL/);
  const badUtm = rows.map((row) => ({ ...row })); badUtm[2].Link = badUtm[2].Link.replace("pin_008", "pin_009");
  assert.throws(() => validateCanonicalBulkIdentity(pins, identities, badUtm, schedule), /UTM content/);
  assert.throws(() => validateCanonicalBulkIdentity(pins, identities, rows.slice(1), schedule), /exactly 20 rows/);
  assert.throws(() => validateCanonicalBulkIdentity(pins, identities, rows, { ...schedule, includePinIds: ["pin_005", ...includePinIds.slice(1)] }), /Pins #6–#25/);
});
