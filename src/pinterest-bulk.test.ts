import assert from "node:assert/strict";
import { test } from "node:test";
import { csvRecords, parseCsv } from "./csv.js";
import { buildExperimentPins, type CampaignConfig, type ExperimentPin, type SourcePin } from "./experiment.js";
import { createPinterestBulkRows, localTimeToPinterestUtc, pinterestBulkHeaders, resolvePinterestBulkSchedule, toPinterestBulkCsv } from "./pinterest-bulk.js";

const config: CampaignConfig = {
  name: "Philippines Arrival Kit", brand: "StampdUp Travel", audience: "travelers", goal: "learn",
  destinationUrl: "https://travel.stampdup.com/philippines-arrival-kit", keywords: ["Philippines travel"], boards: ["Philippines Travel Tips"], pinCount: 25,
  campaignId: "philippines_arrival_kit", publicImageCampaignSlug: "philippines",
  experiment: { id: "experiment", startDate: "2026-08-17", timezone: "America/Chicago", publicationTime: "09:00:00-05:00", utmCampaign: "philippines_arrival_kit" },
  pinterestBulkSchedule: { startDate: "2026-08-22", timezone: "America/Chicago", dailyTimes: ["08:00", "11:00", "14:00", "17:00", "20:00"], pinsPerDay: 5, includePinIds: Array.from({ length: 20 }, (_, index) => `pin_${String(index + 6).padStart(3, "0")}`) },
};

function pins(): ExperimentPin[] {
  const sources: SourcePin[] = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, board: "Philippines Travel Tips", title: `Concept ${index + 1}`, description: "A useful description.", destinationUrl: config.destinationUrl, creativeBrief: `Overlay: “CONCEPT ${index + 1}”`, keywords: ["Philippines travel"] }));
  return buildExperimentPins(config, sources);
}

test("Pinterest bulk CSV uses exact official headers and the configured Pin selection", () => {
  const csv = toPinterestBulkCsv(pins(), config);
  assert.deepEqual(parseCsv(csv)[0], [...pinterestBulkHeaders]);
  const records = csvRecords(csv);
  assert.equal(records.length, 20);
  assert.ok(records.every((row) => row.Thumbnail === "" && row["Pinterest board"] && row.Link.startsWith("https://travel.stampdup.com/philippines-arrival-kit")));
  assert.equal(records[0]["Media URL"], "https://travel.stampdup.com/pins/philippines/concept-17.png");
  assert.equal(new URL(records[0].Link).searchParams.get("utm_content"), "pin_006");
  assert.deepEqual(records.map((row) => new URL(row.Link).searchParams.get("utm_content")), Array.from({ length: 20 }, (_, index) => `pin_${String(index + 6).padStart(3, "0")}`));
});

test("Pinterest schedule assigns five local slots per day chronologically and converts to UTC", () => {
  assert.equal(localTimeToPinterestUtc("2026-08-22", "08:00", "America/Chicago"), "2026-08-22T13:00:00");
  assert.equal(localTimeToPinterestUtc("2026-12-18", "08:00", "America/Chicago"), "2026-12-18T14:00:00");
  const schedule = resolvePinterestBulkSchedule(config);
  const rows = createPinterestBulkRows(pins(), config, schedule);
  assert.deepEqual(rows.slice(0, 6).map((row) => row["Publish date"]), [
    "2026-08-22T13:00:00", "2026-08-22T16:00:00", "2026-08-22T19:00:00", "2026-08-22T22:00:00", "2026-08-23T01:00:00", "2026-08-23T13:00:00",
  ]);
  assert.ok(rows.every((row, index) => index === 0 || row["Publish date"] > rows[index - 1]["Publish date"]));
});

test("Pinterest CSV escapes commas and quotation marks", () => {
  const selected = pins();
  selected[5] = { ...selected[5], title: "A \"quoted\", useful title", description: "Details, choices, and \"checks\"." };
  const records = csvRecords(toPinterestBulkCsv(selected, config));
  assert.equal(records[0].Title, "A \"quoted\", useful title");
  assert.equal(records[0].Description, "Details, choices, and \"checks\".");
  assert.match(records[0].Keywords, /Philippines travel/);
});

test("Pinterest bulk validation enforces limits, URLs, fields, and uniqueness", () => {
  const schedule = { ...resolvePinterestBulkSchedule(config), includePinIds: undefined };
  const base = pins()[1];
  assert.throws(() => createPinterestBulkRows([{ ...base, title: "x".repeat(101) }], config, schedule), /1–100/);
  assert.throws(() => createPinterestBulkRows([{ ...base, description: "x".repeat(501) }], config, schedule), /at most 500/);
  assert.throws(() => createPinterestBulkRows([{ ...base, board: "" }], config, schedule), /board is required/);
  assert.throws(() => createPinterestBulkRows([{ ...base, imagePublicUrl: "http://example.com/pin.png" }], config, schedule), /HTTPS/);
  assert.throws(() => createPinterestBulkRows([{ ...base, trackedDestinationUrl: "not-a-url" }], config, schedule), /HTTPS/);
  assert.throws(() => createPinterestBulkRows([{ ...base }, { ...base, pinId: "pin_003" }], config, schedule), /filename must be unique/);
  const oversized = Array.from({ length: 201 }, (_, index) => ({ ...base, pinId: `pin_${String(index + 2).padStart(3, "0")}`, id: index + 2, imageFilename: `pin-${index}.png`, imagePublicUrl: `https://travel.stampdup.com/pins/philippines/pin-${index}.png` }));
  assert.throws(() => createPinterestBulkRows(oversized, config, schedule), /at most 200/);
});
