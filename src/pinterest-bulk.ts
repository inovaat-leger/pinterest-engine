import { rowsToCsv } from "./csv.js";
import type { CampaignConfig, ExperimentPin } from "./experiment.js";

export const pinterestBulkHeaders = ["Title", "Media URL", "Pinterest board", "Thumbnail", "Description", "Link", "Publish date", "Keywords"] as const;

export type PinterestBulkSchedule = {
  startDate: string;
  timezone: string;
  dailyTimes: string[];
  pinsPerDay: number;
};

export type PinterestBulkRow = Record<(typeof pinterestBulkHeaders)[number], string>;

const defaultDailyTimes = ["08:00", "11:00", "14:00", "17:00", "20:00"];

function requireDate(value: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Invalid Pinterest bulk start date: ${value}.`);
}

function requireTime(value: string): void {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`Invalid Pinterest bulk time: ${value}. Expected HH:mm.`);
}

function datePlusDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function partsInTimezone(date: Date, timezone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

export function localTimeToPinterestUtc(date: string, time: string, timezone: string): string {
  requireDate(date);
  requireTime(time);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error(`Invalid Pinterest bulk timezone: ${timezone}.`);
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = desiredAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = partsInTimezone(new Date(instant), timezone);
    const currentAsUtc = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second);
    const correction = desiredAsUtc - currentAsUtc;
    if (correction === 0) break;
    instant += correction;
  }
  const verified = partsInTimezone(new Date(instant), timezone);
  if (verified.year !== year || verified.month !== month || verified.day !== day || verified.hour !== hour || verified.minute !== minute) throw new Error(`Pinterest bulk time ${date} ${time} does not exist unambiguously in ${timezone}.`);
  return new Date(instant).toISOString().slice(0, 19);
}

export function resolvePinterestBulkSchedule(config: CampaignConfig, overrides: Partial<PinterestBulkSchedule> = {}): PinterestBulkSchedule {
  const configured = config.pinterestBulkSchedule;
  const schedule = {
    startDate: overrides.startDate ?? configured?.startDate ?? config.experiment?.startDate ?? new Date().toISOString().slice(0, 10),
    timezone: overrides.timezone ?? configured?.timezone ?? config.experiment?.timezone ?? "America/Chicago",
    dailyTimes: overrides.dailyTimes ?? configured?.dailyTimes ?? defaultDailyTimes,
    pinsPerDay: overrides.pinsPerDay ?? configured?.pinsPerDay ?? 5,
  };
  requireDate(schedule.startDate);
  for (const time of schedule.dailyTimes) requireTime(time);
  if (!Number.isInteger(schedule.pinsPerDay) || schedule.pinsPerDay < 1 || schedule.pinsPerDay > schedule.dailyTimes.length) throw new Error("Pinterest bulk pinsPerDay must be a positive integer no greater than the number of daily times.");
  localTimeToPinterestUtc(schedule.startDate, schedule.dailyTimes[0], schedule.timezone);
  return schedule;
}

function requireHttps(value: string, label: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${label} must be a valid HTTPS URL.`); }
  if (url.protocol !== "https:") throw new Error(`${label} must be a valid HTTPS URL.`);
  return url;
}

export function createPinterestBulkRows(pins: ExperimentPin[], config: CampaignConfig, schedule: PinterestBulkSchedule): PinterestBulkRow[] {
  const selected = pins.filter((pin) => pin.publicationStatus === "planned" && !pin.isReserve);
  if (selected.length > 200) throw new Error(`Pinterest bulk upload supports at most 200 rows; received ${selected.length}.`);
  const filenames = new Set<string>();
  const mediaUrls = new Set<string>();
  return selected.map((pin, index) => {
    if (!pin.title || pin.title.length > 100) throw new Error(`${pin.pinId} title must contain 1–100 characters.`);
    if (pin.description.length > 500) throw new Error(`${pin.pinId} description must contain at most 500 characters.`);
    if (!pin.board.trim()) throw new Error(`${pin.pinId} Pinterest board is required.`);
    if (!pin.imageFilename || filenames.has(pin.imageFilename)) throw new Error(`${pin.pinId} image filename must be unique.`);
    filenames.add(pin.imageFilename);
    const media = requireHttps(pin.imagePublicUrl, `${pin.pinId} Media URL`);
    if (mediaUrls.has(media.toString())) throw new Error(`${pin.pinId} Media URL must be unique.`);
    mediaUrls.add(media.toString());
    requireHttps(pin.trackedDestinationUrl, `${pin.pinId} Link`);
    const day = Math.floor(index / schedule.pinsPerDay);
    const time = schedule.dailyTimes[index % schedule.pinsPerDay];
    return {
      "Title": pin.title,
      "Media URL": media.toString(),
      "Pinterest board": pin.board,
      "Thumbnail": "",
      "Description": pin.description,
      "Link": pin.trackedDestinationUrl,
      "Publish date": localTimeToPinterestUtc(datePlusDays(schedule.startDate, day), time, schedule.timezone),
      "Keywords": pin.topicTags.join(", "),
    };
  });
}

export function toPinterestBulkCsv(pins: ExperimentPin[], config: CampaignConfig, overrides: Partial<PinterestBulkSchedule> = {}): string {
  const schedule = resolvePinterestBulkSchedule(config, overrides);
  const rows = createPinterestBulkRows(pins, config, schedule);
  return rowsToCsv([[...pinterestBulkHeaders], ...rows.map((row) => pinterestBulkHeaders.map((header) => row[header]))]);
}
