import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExperimentPins, reviewDates, trackedDestinationUrl, validateExperimentPins, validatePinId, type CampaignConfig, type SourcePin } from "./experiment.js";

const config: CampaignConfig = {
  name: "Philippines Arrival Kit",
  brand: "StampdUp Travel",
  audience: "first-time travelers",
  goal: "test Pinterest creative",
  destinationUrl: "https://travel.stampdup.com/philippines-arrival-kit",
  keywords: ["Philippines travel"],
  boards: ["Philippines Travel Tips"],
  pinCount: 25,
  callToAction: "Get the free arrival checklist",
  campaignId: "philippines_arrival_kit",
  experiment: {
    id: "philippines_arrival_kit_4_week_2026_08",
    startDate: "2026-08-17",
    timezone: "America/Chicago",
    publicationTime: "09:00:00-05:00",
    utmCampaign: "philippines_arrival_kit",
  },
};

function sources(): SourcePin[] {
  return Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    board: index % 2 ? "Travel Tech" : "Philippines Travel Tips",
    title: `Source concept ${index + 1}`,
    description: `Description for source concept ${index + 1}.`,
    destinationUrl: config.destinationUrl,
    creativeBrief: `Create concept ${index + 1}. Overlay: “CONCEPT ${index + 1}.”`,
    keywords: [`keyword ${index + 1}`, "Philippines travel"],
  }));
}

test("Pin #1 is the untagged baseline and Pins #2-#25 receive unique deterministic UTMs", () => {
  const pins = buildExperimentPins(config, sources());
  assert.equal(pins[0].pinId, "pin_001");
  assert.equal(pins[0].title, "Philippines eSIM Setup in 5 Minutes");
  assert.equal(pins[0].sourceConceptId, 3);
  assert.equal(pins[0].trackedDestinationUrl, config.destinationUrl);
  assert.equal(pins[0].publicationStatus, "created");
  const contents = pins.slice(1).map((pin) => new URL(pin.trackedDestinationUrl).searchParams.get("utm_content"));
  assert.equal(new Set(contents).size, 24);
  assert.deepEqual(contents, Array.from({ length: 24 }, (_, index) => `pin_${String(index + 2).padStart(3, "0")}`));
  for (const pin of pins.slice(1)) {
    const url = new URL(pin.trackedDestinationUrl);
    assert.equal(`${url.origin}${url.pathname}`, config.destinationUrl);
    assert.equal(url.searchParams.get("utm_source"), "pinterest");
    assert.equal(url.searchParams.get("utm_medium"), "organic");
    assert.equal(url.searchParams.get("utm_campaign"), "philippines_arrival_kit");
  }
});

test("tracking preserves existing parameters and replaces duplicate UTM parameters", () => {
  const tracked = new URL(trackedDestinationUrl("https://travel.stampdup.com/philippines-arrival-kit?ref=guide&utm_source=old&utm_source=duplicate", 2, "philippines_arrival_kit"));
  assert.equal(tracked.searchParams.get("ref"), "guide");
  assert.deepEqual(tracked.searchParams.getAll("utm_source"), ["pinterest"]);
  assert.equal(tracked.searchParams.get("utm_content"), "pin_002");
});

test("the experiment contains four five-Pin weeks and five reserves without adjacent duplicate formats", () => {
  const pins = buildExperimentPins(config, sources());
  const active = pins.filter((pin) => !pin.isReserve);
  const reserves = pins.filter((pin) => pin.isReserve);
  assert.equal(active.length, 20);
  assert.equal(reserves.length, 5);
  for (const week of [1, 2, 3, 4]) {
    const weekPins = active.filter((pin) => pin.testWeek === week);
    assert.equal(weekPins.length, 5);
    assert.deepEqual(weekPins.map((pin) => pin.scheduleSlot), [1, 2, 3, 4, 5]);
  }
  for (let index = 1; index < active.length; index += 1) assert.notEqual(active[index].creativeFormat, active[index - 1].creativeFormat);
  assert.ok(new Set(active.map((pin) => pin.topicPillar)).size >= 6);
  assert.ok(new Set(active.map((pin) => pin.creativeFormat)).size >= 6);
  assert.ok(reserves.every((pin) => pin.testWeek === null && pin.publicationStatus === "reserve" && pin.plannedPublicationAt === ""));
});

test("review dates are calculated from the planned publication date", () => {
  assert.deepEqual(reviewDates("2026-08-17T09:00:00-05:00"), { day7: "2026-08-24", day30: "2026-09-16", day90: "2026-11-15" });
  assert.deepEqual(reviewDates(""), { day7: "", day30: "", day90: "" });
});

test("malformed and duplicate Pin records are rejected", () => {
  assert.throws(() => validatePinId("pin_2"), /Malformed Pin ID/);
  const pins = buildExperimentPins(config, sources());
  const duplicate = pins.map((pin) => ({ ...pin, reviewDates: { ...pin.reviewDates } }));
  duplicate[1].pinId = duplicate[0].pinId;
  assert.throws(() => validateExperimentPins(duplicate), /Duplicate Pin ID/);
  const invalidDate = pins.map((pin) => ({ ...pin, reviewDates: { ...pin.reviewDates } }));
  invalidDate[2].plannedPublicationAt = "08/19/2026";
  assert.throws(() => validateExperimentPins(invalidDate), /Invalid pin_003 planned publication time/);
  const invalidUrl = pins.map((pin) => ({ ...pin, reviewDates: { ...pin.reviewDates } }));
  invalidUrl[3].trackedDestinationUrl = "not-a-url";
  assert.throws(() => validateExperimentPins(invalidUrl), /Invalid pin_004 tracked destination URL/);
  assert.throws(() => buildExperimentPins({ ...config, experiment: { ...config.experiment!, startDate: "2026-02-31" } }, sources()), /Invalid experiment start date/);
  const duplicateSource = pins.map((pin) => ({ ...pin, reviewDates: { ...pin.reviewDates } }));
  duplicateSource[1].sourceConceptId = duplicateSource[0].sourceConceptId;
  assert.throws(() => validateExperimentPins(duplicateSource), /Duplicate source concept assignment/);
});
