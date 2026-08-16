import { csvRecords } from "./csv.js";
import { validatePinId, type ExperimentPin } from "./experiment.js";

export type ReviewWindow = 7 | 30 | 90;
export type EvidenceLevel = "missing" | "no_exposure" | "small_sample" | "minimum_evidence";

export type PerformanceMetrics = {
  impressions: number | null;
  saves: number | null;
  pinClicks: number | null;
  outboundClicks: number | null;
  arrivalKitVisits: number | null;
  checklistOpens: number | null;
  checklistDownloads: number | null;
  printActions: number | null;
  emailSignups: number | null;
  affiliateClicks: number | null;
  affiliateRevenue: number | null;
};

export type PerformanceSnapshot = {
  pinId: string;
  reviewWindow: ReviewWindow;
  reviewDate: string;
  metrics: PerformanceMetrics;
  notes: string;
};

export type PerformanceStore = {
  schemaVersion: 1;
  snapshots: PerformanceSnapshot[];
};

export type CalculatedRates = {
  saveRate: number | null;
  pinClickRate: number | null;
  outboundClickRate: number | null;
  checklistActionRate: number | null;
  affiliateClickRate: number | null;
  revenuePerThousandImpressions: number | null;
};

type Manifest = {
  campaign: { id: string; name: string; baseDestinationUrl: string };
  experiment: { id: string; activePinCount: number; reservePinCount: number };
  pins: ExperimentPin[];
};

const integerColumns: Array<[keyof PerformanceMetrics, string]> = [
  ["impressions", "impressions"],
  ["saves", "saves"],
  ["pinClicks", "pin_clicks"],
  ["outboundClicks", "outbound_clicks"],
  ["arrivalKitVisits", "arrival_kit_visits"],
  ["checklistOpens", "checklist_opens"],
  ["checklistDownloads", "checklist_downloads"],
  ["printActions", "print_actions"],
  ["emailSignups", "email_signups"],
  ["affiliateClicks", "affiliate_clicks"],
];

const requiredColumns = ["pin_id", "review_window", "review_date", ...integerColumns.map(([, column]) => column), "affiliate_revenue", "notes"];
export const minimumEvidenceImpressions = 1000;

function parseMetric(value: string, column: string, integer: boolean, rowNumber: number): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new Error(`Invalid ${column} on performance row ${rowNumber}: expected a non-negative ${integer ? "integer" : "number"}.`);
  }
  return parsed;
}

function validDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function snapshotKey(snapshot: Pick<PerformanceSnapshot, "pinId" | "reviewWindow">): string {
  return `${snapshot.pinId}:${snapshot.reviewWindow}`;
}

export function emptyPerformanceStore(): PerformanceStore {
  return { schemaVersion: 1, snapshots: [] };
}

export function validatePerformanceStore(input: unknown): PerformanceStore {
  if (!input || typeof input !== "object") throw new Error("Performance store must be a JSON object.");
  const value = input as Partial<PerformanceStore>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.snapshots)) throw new Error("Unsupported performance store schema.");
  const seen = new Set<string>();
  for (const snapshot of value.snapshots) {
    validatePinId(snapshot.pinId);
    if (![7, 30, 90].includes(snapshot.reviewWindow)) throw new Error(`Invalid review window for ${snapshot.pinId}: ${snapshot.reviewWindow}.`);
    if (!validDate(snapshot.reviewDate)) throw new Error(`Invalid review date for ${snapshot.pinId}: ${snapshot.reviewDate}.`);
    const key = snapshotKey(snapshot);
    if (seen.has(key)) throw new Error(`Duplicate performance snapshot: ${key}.`);
    seen.add(key);
    for (const [metric, column] of integerColumns) {
      const metricValue = snapshot.metrics[metric];
      if (metricValue !== null && (!Number.isInteger(metricValue) || metricValue < 0)) throw new Error(`Invalid ${column} in performance store for ${key}.`);
    }
    const revenue = snapshot.metrics.affiliateRevenue;
    if (revenue !== null && (!Number.isFinite(revenue) || revenue < 0)) throw new Error(`Invalid affiliate_revenue in performance store for ${key}.`);
  }
  return value as PerformanceStore;
}

export function parsePerformanceImport(csv: string, validPinIds: Set<string>): PerformanceSnapshot[] {
  const records = csvRecords(csv);
  if (records.length === 0) return [];
  const columns = new Set(Object.keys(records[0]));
  for (const column of requiredColumns) if (!columns.has(column)) throw new Error(`Performance CSV is missing required column: ${column}.`);
  const snapshots: PerformanceSnapshot[] = [];
  const seen = new Set<string>();
  for (const [index, record] of records.entries()) {
    const rowNumber = index + 2;
    const currentPinId = record.pin_id.trim();
    validatePinId(currentPinId);
    if (!validPinIds.has(currentPinId)) throw new Error(`Unknown Pin ID on performance row ${rowNumber}: ${currentPinId}.`);
    const windowNumber = Number(record.review_window);
    if (windowNumber !== 7 && windowNumber !== 30 && windowNumber !== 90) throw new Error(`Invalid review_window on performance row ${rowNumber}: ${record.review_window}.`);
    if (!validDate(record.review_date)) throw new Error(`Invalid review_date on performance row ${rowNumber}: ${record.review_date}.`);
    const metrics = Object.fromEntries(integerColumns.map(([metric, column]) => [metric, parseMetric(record[column], column, true, rowNumber)])) as Omit<PerformanceMetrics, "affiliateRevenue">;
    const completeMetrics: PerformanceMetrics = { ...metrics, affiliateRevenue: parseMetric(record.affiliate_revenue, "affiliate_revenue", false, rowNumber) };
    if (Object.values(completeMetrics).every((value) => value === null)) continue;
    const snapshot: PerformanceSnapshot = { pinId: currentPinId, reviewWindow: windowNumber, reviewDate: record.review_date, metrics: completeMetrics, notes: record.notes };
    const key = snapshotKey(snapshot);
    if (seen.has(key)) throw new Error(`Duplicate performance row for ${key}.`);
    seen.add(key);
    snapshots.push(snapshot);
  }
  return snapshots;
}

export function mergePerformanceSnapshots(store: PerformanceStore, imported: PerformanceSnapshot[]): { store: PerformanceStore; added: number; updated: number; unchanged: number } {
  validatePerformanceStore(store);
  const byKey = new Map(store.snapshots.map((snapshot) => [snapshotKey(snapshot), snapshot]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const snapshot of imported) {
    const key = snapshotKey(snapshot);
    const existing = byKey.get(key);
    if (!existing) added += 1;
    else if (JSON.stringify(existing) === JSON.stringify(snapshot)) unchanged += 1;
    else updated += 1;
    byKey.set(key, snapshot);
  }
  const snapshots = [...byKey.values()].sort((left, right) => left.pinId.localeCompare(right.pinId) || left.reviewWindow - right.reviewWindow);
  return { store: validatePerformanceStore({ schemaVersion: 1, snapshots }), added, updated, unchanged };
}

function safeRate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function sumPresent(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

export function calculateRates(metrics: PerformanceMetrics): CalculatedRates {
  const checklistActions = sumPresent([metrics.checklistOpens, metrics.checklistDownloads, metrics.printActions]);
  return {
    saveRate: safeRate(metrics.saves, metrics.impressions),
    pinClickRate: safeRate(metrics.pinClicks, metrics.impressions),
    outboundClickRate: safeRate(metrics.outboundClicks, metrics.impressions),
    checklistActionRate: safeRate(checklistActions, metrics.arrivalKitVisits),
    affiliateClickRate: safeRate(metrics.affiliateClicks, metrics.arrivalKitVisits),
    revenuePerThousandImpressions: metrics.affiliateRevenue === null || metrics.impressions === null || metrics.impressions === 0 ? null : metrics.affiliateRevenue / metrics.impressions * 1000,
  };
}

export function evidenceLevel(metrics: PerformanceMetrics): EvidenceLevel {
  if (metrics.impressions === null) return "missing";
  if (metrics.impressions === 0) return "no_exposure";
  if (metrics.impressions < minimumEvidenceImpressions) return "small_sample";
  return "minimum_evidence";
}

function aggregateMetrics(snapshots: PerformanceSnapshot[]): PerformanceMetrics {
  const metricNames: Array<keyof PerformanceMetrics> = ["impressions", "saves", "pinClicks", "outboundClicks", "arrivalKitVisits", "checklistOpens", "checklistDownloads", "printActions", "emailSignups", "affiliateClicks", "affiliateRevenue"];
  return Object.fromEntries(metricNames.map((name) => [name, sumPresent(snapshots.map((snapshot) => snapshot.metrics[name]))])) as PerformanceMetrics;
}

function groupRows(pinRows: ReportPinRow[], key: keyof Pick<ReportPinRow, "topicPillar" | "creativeFormat" | "hook" | "travelerIntent">): ReportGroupRow[] {
  const groups = new Map<string, ReportPinRow[]>();
  for (const row of pinRows) {
    const value = row[key];
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return [...groups.entries()].map(([value, rows]) => {
    const snapshots = rows.flatMap((row) => row.snapshot ? [row.snapshot] : []);
    const metrics = aggregateMetrics(snapshots);
    return { value, pinCount: rows.length, pinsWithData: snapshots.length, metrics, rates: calculateRates(metrics), evidence: evidenceLevel(metrics) };
  }).sort((left, right) => left.value.localeCompare(right.value));
}

export type ReportPinRow = {
  pinId: string;
  title: string;
  topicPillar: string;
  creativeFormat: string;
  hook: string;
  travelerIntent: string;
  reviewDate: string;
  snapshot: PerformanceSnapshot | null;
  metrics: PerformanceMetrics | null;
  rates: CalculatedRates | null;
  evidence: EvidenceLevel;
};

export type ReportGroupRow = {
  value: string;
  pinCount: number;
  pinsWithData: number;
  metrics: PerformanceMetrics;
  rates: CalculatedRates;
  evidence: EvidenceLevel;
};

export type CampaignReport = {
  schemaVersion: 1;
  campaign: { id: string; name: string; experimentId: string };
  reporting: { windowDays: ReviewWindow; interpretation: string; asOfDate: string };
  completeness: { expectedPins: number; pinsWithData: number; percentage: number };
  pins: ReportPinRow[];
  groups: { topicPillar: ReportGroupRow[]; creativeFormat: ReportGroupRow[]; hook: ReportGroupRow[]; travelerIntent: ReportGroupRow[] };
  rankings: { outboundClickRate: string[]; checklistActionRate: string[]; saveRate: string[] };
  missingReviews: string[];
  overdueReviews: string[];
  observations: string[];
  hypotheses: string[];
};

function interpretation(window: ReviewWindow): string {
  if (window === 7) return "Early signal only; do not declare a permanent winner.";
  if (window === 30) return "Meaningful comparison window; compare patterns while retaining sample-size cautions.";
  return "Durability and business-value review; compare sustained engagement and downstream actions.";
}

function ranking(rows: ReportPinRow[], rate: keyof Pick<CalculatedRates, "outboundClickRate" | "checklistActionRate" | "saveRate">): string[] {
  return rows.filter((row) => row.rates?.[rate] !== null && row.rates?.[rate] !== undefined).sort((left, right) => (right.rates?.[rate] ?? -1) - (left.rates?.[rate] ?? -1)).slice(0, 5).map((row) => row.pinId);
}

export function buildCampaignReport(manifest: Manifest, store: PerformanceStore, window: ReviewWindow, asOfDate = new Date().toISOString().slice(0, 10)): CampaignReport {
  validatePerformanceStore(store);
  if (!validDate(asOfDate)) throw new Error(`Invalid report as-of date: ${asOfDate}.`);
  const activePins = manifest.pins.filter((pin) => !pin.isReserve);
  const snapshots = new Map(store.snapshots.filter((snapshot) => snapshot.reviewWindow === window).map((snapshot) => [snapshot.pinId, snapshot]));
  const dateKey = window === 7 ? "day7" : window === 30 ? "day30" : "day90";
  const pins: ReportPinRow[] = activePins.map((pin) => {
    const snapshot = snapshots.get(pin.pinId) ?? null;
    return {
      pinId: pin.pinId,
      title: pin.title,
      topicPillar: pin.topicPillar,
      creativeFormat: pin.creativeFormat,
      hook: pin.hook,
      travelerIntent: pin.travelerIntent,
      reviewDate: pin.reviewDates[dateKey],
      snapshot,
      metrics: snapshot?.metrics ?? null,
      rates: snapshot ? calculateRates(snapshot.metrics) : null,
      evidence: snapshot ? evidenceLevel(snapshot.metrics) : "missing",
    };
  });
  const pinsWithData = pins.filter((pin) => pin.snapshot).length;
  const missingReviews = pins.filter((pin) => !pin.snapshot).map((pin) => pin.pinId);
  const overdueReviews = pins.filter((pin) => !pin.snapshot && pin.reviewDate && pin.reviewDate < asOfDate).map((pin) => pin.pinId);
  const observations = pinsWithData === 0
    ? [`No ${window}-day performance snapshots have been recorded.`]
    : [`${pinsWithData} of ${activePins.length} planned Pins have ${window}-day snapshots.`, `${pins.filter((pin) => pin.evidence === "small_sample").length} recorded Pins remain below ${minimumEvidenceImpressions} impressions.`];
  const hypotheses = pinsWithData === 0
    ? ["Collect the scheduled snapshots before proposing a creative or topic follow-up."]
    : ["Use the strongest save-oriented format as a candidate for a controlled follow-up, not as a permanent winner.", "Compare outbound-click and checklist-action patterns again at the next review window before reallocating reserve Pins."];
  return {
    schemaVersion: 1,
    campaign: { id: manifest.campaign.id, name: manifest.campaign.name, experimentId: manifest.experiment.id },
    reporting: { windowDays: window, interpretation: interpretation(window), asOfDate },
    completeness: { expectedPins: activePins.length, pinsWithData, percentage: activePins.length === 0 ? 0 : pinsWithData / activePins.length },
    pins,
    groups: { topicPillar: groupRows(pins, "topicPillar"), creativeFormat: groupRows(pins, "creativeFormat"), hook: groupRows(pins, "hook"), travelerIntent: groupRows(pins, "travelerIntent") },
    rankings: { outboundClickRate: ranking(pins, "outboundClickRate"), checklistActionRate: ranking(pins, "checklistActionRate"), saveRate: ranking(pins, "saveRate") },
    missingReviews,
    overdueReviews,
    observations,
    hypotheses,
  };
}

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}

function markdownGroup(title: string, groups: ReportGroupRow[]): string {
  const rows = groups.map((group) => `| ${group.value} | ${group.pinsWithData}/${group.pinCount} | ${group.metrics.impressions ?? "—"} | ${percent(group.rates.saveRate)} | ${percent(group.rates.outboundClickRate)} | ${group.evidence} |`).join("\n");
  return `## ${title}\n\n| Group | Data | Impressions | Save rate | Outbound CTR | Evidence |\n|---|---:|---:|---:|---:|---|\n${rows || "| — | 0/0 | — | — | — | missing |"}\n`;
}

export function campaignReportMarkdown(report: CampaignReport): string {
  const pinRows = report.pins.map((pin) => `| ${pin.pinId} | ${pin.title} | ${pin.metrics?.impressions ?? "—"} | ${percent(pin.rates?.saveRate ?? null)} | ${percent(pin.rates?.outboundClickRate ?? null)} | ${percent(pin.rates?.checklistActionRate ?? null)} | ${pin.evidence} |`).join("\n");
  return `# ${report.campaign.name} — ${report.reporting.windowDays}-day report\n\n${report.reporting.interpretation}\n\n## Campaign summary\n\n- Experiment: \`${report.campaign.experimentId}\`\n- Reporting window: ${report.reporting.windowDays} days\n- As of: ${report.reporting.asOfDate}\n- Data completeness: ${report.completeness.pinsWithData}/${report.completeness.expectedPins} (${percent(report.completeness.percentage)})\n- Missing reviews: ${report.missingReviews.join(", ") || "None"}\n- Overdue reviews: ${report.overdueReviews.join(", ") || "None"}\n\n## Results by Pin\n\n| Pin | Title | Impressions | Save rate | Outbound CTR | Checklist action rate | Evidence |\n|---|---|---:|---:|---:|---:|---|\n${pinRows}\n\n${markdownGroup("Results by topic pillar", report.groups.topicPillar)}\n${markdownGroup("Results by creative format", report.groups.creativeFormat)}\n${markdownGroup("Results by hook", report.groups.hook)}\n${markdownGroup("Results by traveler intent", report.groups.travelerIntent)}\n## Performance views\n\n- Highest outbound-click rates: ${report.rankings.outboundClickRate.join(", ") || "Insufficient data"}\n- Highest checklist-action rates: ${report.rankings.checklistActionRate.join(", ") || "Insufficient data"}\n- Save-oriented performers: ${report.rankings.saveRate.join(", ") || "Insufficient data"}\n- Click-oriented performers: ${report.rankings.outboundClickRate.join(", ") || "Insufficient data"}\n\n## Observations\n\n${report.observations.map((item) => `- ${item}`).join("\n")}\n\n## Hypotheses for the next test\n\n${report.hypotheses.map((item) => `- ${item}`).join("\n")}\n`;
}
