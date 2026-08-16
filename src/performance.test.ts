import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExperimentPins, type CampaignConfig, type SourcePin } from "./experiment.js";
import { buildCampaignReport, calculateRates, campaignReportMarkdown, emptyPerformanceStore, evidenceLevel, mergePerformanceSnapshots, parsePerformanceImport, type PerformanceMetrics } from "./performance.js";

const header = "pin_id,review_window,review_date,impressions,saves,pin_clicks,outbound_clicks,arrival_kit_visits,checklist_opens,checklist_downloads,print_actions,email_signups,affiliate_clicks,affiliate_revenue,notes\n";
const validIds = new Set(["pin_001", "pin_002"]);

function metrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    impressions: null,
    saves: null,
    pinClicks: null,
    outboundClicks: null,
    arrivalKitVisits: null,
    checklistOpens: null,
    checklistDownloads: null,
    printActions: null,
    emailSignups: null,
    affiliateClicks: null,
    affiliateRevenue: null,
    ...overrides,
  };
}

test("performance import preserves missing versus zero and rejects unknown or negative data", () => {
  const imported = parsePerformanceImport(header + "pin_001,7,2026-08-24,0,0,0,0,,,,,,,0,zero is recorded\npin_002,7,2026-08-25,500,12,20,8,6,2,1,0,0,0,0,early signal\n", validIds);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].metrics.impressions, 0);
  assert.equal(imported[0].metrics.checklistOpens, null);
  assert.equal(imported[0].metrics.affiliateRevenue, 0);
  assert.throws(() => parsePerformanceImport(header + "pin_999,7,2026-08-24,100,1,1,1,1,1,1,1,0,0,0,unknown\n", validIds), /Unknown Pin ID/);
  assert.throws(() => parsePerformanceImport(header + "pin_001,7,2026-08-24,-1,1,1,1,1,1,1,1,0,0,0,negative\n", validIds), /non-negative integer/);
  assert.throws(() => parsePerformanceImport(header + "pin_001,14,2026-08-24,100,1,1,1,1,1,1,1,0,0,0,bad window\n", validIds), /Invalid review_window/);
  assert.throws(() => parsePerformanceImport(header + "pin_001,7,2026-02-31,100,1,1,1,1,1,1,1,0,0,0,bad date\n", validIds), /Invalid review_date/);
});

test("blank template rows are skipped and repeated imports are idempotent", () => {
  const blankRow = ["pin_001", "7", "2026-08-24", ...Array(12).fill("")].join(",") + "\n";
  assert.deepEqual(parsePerformanceImport(header + blankRow, validIds), []);
  const imported = parsePerformanceImport(header + "pin_001,7,2026-08-24,1200,30,40,20,15,4,2,1,0,0,0,complete\n", validIds);
  const first = mergePerformanceSnapshots(emptyPerformanceStore(), imported);
  assert.deepEqual({ added: first.added, updated: first.updated, unchanged: first.unchanged }, { added: 1, updated: 0, unchanged: 0 });
  const second = mergePerformanceSnapshots(first.store, imported);
  assert.deepEqual({ added: second.added, updated: second.updated, unchanged: second.unchanged }, { added: 0, updated: 0, unchanged: 1 });
  assert.equal(second.store.snapshots.length, 1);
});

test("rate calculations avoid division by zero and retain legitimate zero rates", () => {
  const zeroDenominator = calculateRates(metrics({ impressions: 0, saves: 0, outboundClicks: 0, affiliateRevenue: 0 }));
  assert.equal(zeroDenominator.saveRate, null);
  assert.equal(zeroDenominator.outboundClickRate, null);
  assert.equal(zeroDenominator.revenuePerThousandImpressions, null);

  const rates = calculateRates(metrics({ impressions: 2000, saves: 0, pinClicks: 40, outboundClicks: 20, arrivalKitVisits: 10, checklistOpens: 2, checklistDownloads: 1, printActions: 0, affiliateClicks: 0, affiliateRevenue: 5 }));
  assert.equal(rates.saveRate, 0);
  assert.equal(rates.pinClickRate, 0.02);
  assert.equal(rates.outboundClickRate, 0.01);
  assert.equal(rates.checklistActionRate, 0.3);
  assert.equal(rates.affiliateClickRate, 0);
  assert.equal(rates.revenuePerThousandImpressions, 2.5);
  assert.equal(evidenceLevel(metrics({ impressions: 999 })), "small_sample");
  assert.equal(evidenceLevel(metrics({ impressions: 1000 })), "minimum_evidence");
  assert.equal(evidenceLevel(metrics({ impressions: null })), "missing");
});

function manifestFixture() {
  const config: CampaignConfig = {
    name: "Philippines Arrival Kit",
    brand: "StampdUp Travel",
    audience: "travelers",
    goal: "learn",
    destinationUrl: "https://travel.stampdup.com/philippines-arrival-kit",
    keywords: ["Philippines travel"],
    boards: ["Philippines Travel Tips"],
    pinCount: 25,
    campaignId: "philippines_arrival_kit",
    experiment: { id: "experiment", startDate: "2026-08-17", timezone: "America/Chicago", publicationTime: "09:00:00-05:00", utmCampaign: "philippines_arrival_kit" },
  };
  const sources: SourcePin[] = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, board: "Philippines Travel Tips", title: `Concept ${index + 1}`, description: "Description.", destinationUrl: config.destinationUrl, creativeBrief: `Overlay: “CONCEPT ${index + 1}”`, keywords: ["Philippines travel"] }));
  const pins = buildExperimentPins(config, sources);
  return { campaign: { id: "philippines_arrival_kit", name: config.name, baseDestinationUrl: config.destinationUrl }, experiment: { id: "experiment", activePinCount: 20, reservePinCount: 5 }, pins };
}

test("machine-readable and Markdown reports preserve windows, completeness, warnings, and hypotheses", () => {
  const imported = parsePerformanceImport(header + "pin_001,7,2026-08-24,500,20,30,15,10,2,1,1,0,0,0,small sample\n", new Set(manifestFixture().pins.map((pin) => pin.pinId)));
  const store = mergePerformanceSnapshots(emptyPerformanceStore(), imported).store;
  const report = buildCampaignReport(manifestFixture(), store, 7, "2026-08-26");
  assert.equal(report.reporting.windowDays, 7);
  assert.match(report.reporting.interpretation, /Early signal only/);
  assert.equal(report.completeness.expectedPins, 20);
  assert.equal(report.completeness.pinsWithData, 1);
  assert.equal(report.pins[0].evidence, "small_sample");
  assert.ok(report.missingReviews.includes("pin_002"));
  assert.ok(report.overdueReviews.includes("pin_002"));
  assert.doesNotThrow(() => JSON.stringify(report));
  const markdown = campaignReportMarkdown(report);
  assert.match(markdown, /# Philippines Arrival Kit — 7-day report/);
  assert.match(markdown, /## Observations/);
  assert.match(markdown, /## Hypotheses for the next test/);
  assert.match(markdown, /## Results by hook/);
  assert.match(markdown, /## Results by traveler intent/);
  assert.match(markdown, /small_sample/);
});
