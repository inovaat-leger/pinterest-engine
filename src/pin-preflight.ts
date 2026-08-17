import type { CanonicalPinIdentity, ExperimentPin } from "./experiment.js";
import type { PinterestBulkRow, PinterestBulkSchedule } from "./pinterest-bulk.js";

export type PinPreflightResult = {
  pinId: string;
  canonicalTitle: string;
  sourceFilename: string;
  driveFileId: string;
  mediaUrl: string;
  board: string;
  utmContent: string;
  scheduledLocal: string;
  validation: "PASS";
};

function localSchedule(value: string, timezone: string): string {
  if (!value) return "IMMEDIATE";
  const instant = new Date(`${value}Z`);
  if (Number.isNaN(instant.valueOf())) throw new Error(`Invalid Pinterest publish timestamp: ${value}.`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const part = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute} ${timezone}`;
}

export function validateCanonicalBulkIdentity(
  pins: ExperimentPin[],
  identities: CanonicalPinIdentity[],
  rows: PinterestBulkRow[],
  schedule: PinterestBulkSchedule,
): PinPreflightResult[] {
  const expectedIds = schedule.includePinIds ?? [];
  const identityById = new Map(identities.map((identity) => [identity.pinId, identity]));
  const pinById = new Map(pins.map((pin) => [pin.pinId, pin]));
  if (rows.length !== 20) throw new Error(`Corrected Pinterest bulk file must contain exactly 20 rows; received ${rows.length}.`);
  if (expectedIds.length !== 20 || new Set(expectedIds).size !== 20 || expectedIds.some((pinId) => ["pin_001", "pin_002", "pin_003", "pin_004", "pin_005"].includes(pinId))) throw new Error("Pinterest bulk selection must contain exactly 20 unique non-baseline Pin IDs and exclude Pins #1–#5.");
  const seen = new Set<string>();
  return expectedIds.map((pinId, index) => {
    const identity = identityById.get(pinId);
    const pin = pinById.get(pinId);
    const row = rows[index];
    if (!identity) throw new Error(`${pinId} is missing its canonical Drive mapping.`);
    if (!pin) throw new Error(`${pinId} is missing from generated campaign data.`);
    if (seen.has(pinId)) throw new Error(`${pinId} appears more than once in the corrected bulk file.`);
    seen.add(pinId);
    if (pin.sourceConceptId !== identity.sourceConceptId) throw new Error(`${pinId} source concept disagrees with its canonical identity.`);
    if (pin.title !== identity.canonicalTitle || row.Title !== identity.canonicalTitle) throw new Error(`${pinId} generated title does not match its canonical title.`);
    if (pin.imageFilename !== identity.filename) throw new Error(`${pinId} generated filename does not match its canonical artwork.`);
    const expectedMedia = `https://travel.stampdup.com/pins/${identity.campaign}/${identity.filename}`;
    const requiredVersion = "-v2.png";
    if (!identity.filename.endsWith(requiredVersion)) throw new Error(`${pinId} must use its new versioned ${requiredVersion} Media URL.`);
    if (pin.imagePublicUrl !== expectedMedia || row["Media URL"] !== expectedMedia) throw new Error(`${pinId} public Media URL does not match its canonical manifest entry.`);
    const content = new URL(row.Link).searchParams.get("utm_content") ?? "";
    if (content !== pinId || new URL(pin.trackedDestinationUrl).searchParams.get("utm_content") !== pinId) throw new Error(`${pinId} UTM content ID disagrees with its canonical Pin ID.`);
    if (row.Description !== pin.description || row["Pinterest board"] !== pin.board || row.Keywords !== pin.topicTags.join(", ")) throw new Error(`${pinId} publishing metadata disagrees with canonical generated data.`);
    if (row.Title.length > 100 || row.Description.length > 500 || !row["Pinterest board"].trim() || row.Keywords.length === 0) throw new Error(`${pinId} violates Pinterest publishing limits or required fields.`);
    if (new URL(row["Media URL"]).protocol !== "https:" || new URL(row.Link).protocol !== "https:") throw new Error(`${pinId} has an invalid publishing URL.`);
    return {
      pinId,
      canonicalTitle: identity.canonicalTitle,
      sourceFilename: identity.sourceFilename,
      driveFileId: identity.driveFileId ?? identity.localPath ?? "",
      mediaUrl: expectedMedia,
      board: pin.board,
      utmContent: content,
      scheduledLocal: localSchedule(row["Publish date"], schedule.timezone),
      validation: "PASS",
    };
  });
}

function cell(value: string): string { return value.replaceAll("|", "\\|"); }

export function buildPinterestPreflightMarkdown(results: PinPreflightResult[]): string {
  const header = [
    "# Corrected Pinterest bulk-upload preflight",
    "",
    `Validated rows: ${results.length}. Pins #1–#5 are excluded; ${results[0]?.pinId ?? "no Pins"} through ${results.at(-1)?.pinId ?? "no Pins"} appear exactly once.`,
    "",
    "| Pin ID | Canonical title | Source artwork filename | Drive file ID | Public Media URL | Board | UTM content ID | Scheduled local date/time | Result |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  const rows = results.map((result) => `| ${result.pinId} | ${cell(result.canonicalTitle)} | ${cell(result.sourceFilename)} | ${result.driveFileId} | ${result.mediaUrl} | ${cell(result.board)} | ${result.utmContent} | ${result.scheduledLocal} | ${result.validation} |`);
  return [...header, ...rows, ""].join("\n");
}
