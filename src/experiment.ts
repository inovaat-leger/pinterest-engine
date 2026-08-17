export type CreativeFormat = "step_by_step_infographic" | "saveable_checklist" | "mistakes_to_avoid" | "timeline" | "travel_photo_led" | "comparison_decision";
export type TopicPillar = "phone_esim" | "airport_logistics" | "first_72_hours" | "money_payment" | "offline_preparation" | "digital_nomad_connectivity";
export type PublicationStatus = "planned" | "created" | "scheduled" | "published" | "reserve";
export type TravelerIntent = "setup_connectivity" | "navigate_arrival" | "settle_first_days" | "prepare_offline" | "manage_money" | "work_reliably";

export type ExperimentConfig = {
  id: string;
  startDate: string;
  timezone: string;
  publicationTime: string;
  utmCampaign: string;
};

export type PinterestBulkScheduleConfig = {
  startDate: string;
  timezone: string;
  dailyTimes: string[];
  pinsPerDay: number;
  includePinIds?: string[];
};

export type CampaignConfig = {
  name: string;
  brand: string;
  audience: string;
  goal: string;
  destinationUrl: string;
  keywords: string[];
  boards: string[];
  pinCount?: number;
  callToAction?: string;
  campaignId?: string;
  experiment?: ExperimentConfig;
  publicImageCampaignSlug?: string;
  pinterestBulkSchedule?: PinterestBulkScheduleConfig;
};

export type SourcePin = {
  id: number;
  board: string;
  title: string;
  description: string;
  destinationUrl: string;
  creativeBrief: string;
  keywords: string[];
};

export type ReviewDates = { day7: string; day30: string; day90: string };

export type ExperimentPin = SourcePin & {
  pinId: string;
  sourceConceptId: number;
  campaignId: string;
  experimentId: string;
  testWeek: number | null;
  scheduleSlot: number | null;
  isReserve: boolean;
  topicPillar: TopicPillar;
  primarySearchPhrase: string;
  secondaryKeywords: string[];
  travelerIntent: TravelerIntent;
  creativeFormat: CreativeFormat;
  hook: string;
  onImageText: string;
  callToAction: string;
  topicTags: string[];
  altText: string;
  imageFilename: string;
  imagePublicUrl: string;
  baseDestinationUrl: string;
  trackedDestinationUrl: string;
  plannedPublicationAt: string;
  publicationStatus: PublicationStatus;
  publishedPinUrl: string;
  reviewDates: ReviewDates;
  experimentNotes: string;
};

type Assignment = {
  sourceConceptId: number;
  topicPillar: TopicPillar;
  primarySearchPhrase: string;
  travelerIntent: TravelerIntent;
  creativeFormat: CreativeFormat;
  notes?: string;
};

const philippinesAssignments: Assignment[] = [
  { sourceConceptId: 3, topicPillar: "phone_esim", primarySearchPhrase: "Philippines eSIM setup", travelerIntent: "setup_connectivity", creativeFormat: "step_by_step_infographic", notes: "Existing untagged baseline; do not recreate or rewrite its historical destination." },
  { sourceConceptId: 10, topicPillar: "airport_logistics", primarySearchPhrase: "Manila airport transportation", travelerIntent: "navigate_arrival", creativeFormat: "comparison_decision" },
  { sourceConceptId: 7, topicPillar: "offline_preparation", primarySearchPhrase: "Philippines travel checklist", travelerIntent: "prepare_offline", creativeFormat: "saveable_checklist" },
  { sourceConceptId: 9, topicPillar: "first_72_hours", primarySearchPhrase: "first 72 hours Philippines", travelerIntent: "settle_first_days", creativeFormat: "timeline" },
  { sourceConceptId: 11, topicPillar: "money_payment", primarySearchPhrase: "Philippines money and ATM tips", travelerIntent: "manage_money", creativeFormat: "saveable_checklist" },
  { sourceConceptId: 17, topicPillar: "phone_esim", primarySearchPhrase: "Philippines eSIM mistakes", travelerIntent: "setup_connectivity", creativeFormat: "mistakes_to_avoid" },
  { sourceConceptId: 4, topicPillar: "airport_logistics", primarySearchPhrase: "Philippines airport arrival tips", travelerIntent: "navigate_arrival", creativeFormat: "saveable_checklist" },
  { sourceConceptId: 13, topicPillar: "digital_nomad_connectivity", primarySearchPhrase: "digital nomad Philippines", travelerIntent: "work_reliably", creativeFormat: "travel_photo_led" },
  { sourceConceptId: 12, topicPillar: "airport_logistics", primarySearchPhrase: "Philippines arrival mistakes", travelerIntent: "navigate_arrival", creativeFormat: "mistakes_to_avoid" },
  { sourceConceptId: 15, topicPillar: "phone_esim", primarySearchPhrase: "keep home number with eSIM", travelerIntent: "setup_connectivity", creativeFormat: "comparison_decision" },
  { sourceConceptId: 2, topicPillar: "phone_esim", primarySearchPhrase: "Philippines eSIM before takeoff", travelerIntent: "setup_connectivity", creativeFormat: "travel_photo_led" },
  { sourceConceptId: 6, topicPillar: "first_72_hours", primarySearchPhrase: "first 24 hours Manila", travelerIntent: "settle_first_days", creativeFormat: "timeline" },
  { sourceConceptId: 5, topicPillar: "phone_esim", primarySearchPhrase: "physical SIM or eSIM Philippines", travelerIntent: "setup_connectivity", creativeFormat: "comparison_decision" },
  { sourceConceptId: 19, topicPillar: "offline_preparation", primarySearchPhrase: "Manila arrival offline checklist", travelerIntent: "prepare_offline", creativeFormat: "saveable_checklist" },
  { sourceConceptId: 14, topicPillar: "digital_nomad_connectivity", primarySearchPhrase: "Philippines backup internet", travelerIntent: "work_reliably", creativeFormat: "travel_photo_led" },
  { sourceConceptId: 16, topicPillar: "phone_esim", primarySearchPhrase: "Philippines eSIM compatibility", travelerIntent: "setup_connectivity", creativeFormat: "saveable_checklist" },
  { sourceConceptId: 18, topicPillar: "phone_esim", primarySearchPhrase: "when to activate Philippines eSIM", travelerIntent: "setup_connectivity", creativeFormat: "timeline" },
  { sourceConceptId: 20, topicPillar: "offline_preparation", primarySearchPhrase: "useful apps Philippines travel", travelerIntent: "prepare_offline", creativeFormat: "saveable_checklist" },
  { sourceConceptId: 1, topicPillar: "airport_logistics", primarySearchPhrase: "Manila airport arrival data", travelerIntent: "navigate_arrival", creativeFormat: "travel_photo_led" },
  { sourceConceptId: 23, topicPillar: "offline_preparation", primarySearchPhrase: "offline maps Philippines", travelerIntent: "prepare_offline", creativeFormat: "step_by_step_infographic" },
  { sourceConceptId: 8, topicPillar: "phone_esim", primarySearchPhrase: "Philippines mobile data needs", travelerIntent: "setup_connectivity", creativeFormat: "comparison_decision", notes: "Reserve concept." },
  { sourceConceptId: 21, topicPillar: "airport_logistics", primarySearchPhrase: "Manila airport Wi-Fi", travelerIntent: "navigate_arrival", creativeFormat: "mistakes_to_avoid", notes: "Reserve concept." },
  { sourceConceptId: 22, topicPillar: "offline_preparation", primarySearchPhrase: "Philippines arrival apps", travelerIntent: "prepare_offline", creativeFormat: "saveable_checklist", notes: "Reserve concept." },
  { sourceConceptId: 24, topicPillar: "phone_esim", primarySearchPhrase: "Philippines eSIM preflight checks", travelerIntent: "setup_connectivity", creativeFormat: "saveable_checklist", notes: "Reserve concept." },
  { sourceConceptId: 25, topicPillar: "airport_logistics", primarySearchPhrase: "Philippines preflight arrival check", travelerIntent: "navigate_arrival", creativeFormat: "travel_photo_led", notes: "Reserve concept." },
];

export function extractOverlayText(pin: SourcePin): string {
  const match = pin.creativeBrief.match(/\b(?:overlay|headline):?\s*[“"]([^”"]+)[”"]/i);
  return match?.[1]?.trim() || pin.title.replace(/\s+—\s+Part\s+\d+$/i, "").trim();
}

export function pinFilename(pin: Pick<SourcePin, "id" | "title">): string {
  const slug = pin.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "").replace(/&/g, " and ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || `pin-${pin.id}`}.png`;
}

export function pinId(number: number): string {
  if (!Number.isInteger(number) || number < 1 || number > 999) throw new Error(`Invalid Pin number: ${number}.`);
  return `pin_${String(number).padStart(3, "0")}`;
}

export function validatePinId(value: string): void {
  if (!/^pin_\d{3}$/.test(value) || value === "pin_000") throw new Error(`Malformed Pin ID: ${value}. Expected pin_###.`);
}

export function trackedDestinationUrl(baseDestinationUrl: string, number: number, utmCampaign: string): string {
  const url = requireHttpUrl(baseDestinationUrl, "base destination URL");
  if (number === 1) return baseDestinationUrl;
  url.searchParams.set("utm_source", "pinterest");
  url.searchParams.set("utm_medium", "organic");
  url.searchParams.set("utm_campaign", utmCampaign);
  url.searchParams.set("utm_content", pinId(number));
  return url.toString();
}

function requireHttpUrl(value: string, label: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url;
  } catch {
    throw new Error(`Invalid ${label}: ${value}.`);
  }
}

function requireDate(value: string, label: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${label}: ${value}. Expected YYYY-MM-DD.`);
}

function requireTimestamp(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${label}: ${value}. Expected an ISO timestamp with timezone.`);
}

function addDays(date: string, days: number): string {
  requireDate(date, "date");
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function reviewDates(plannedPublicationAt: string): ReviewDates {
  if (!plannedPublicationAt) return { day7: "", day30: "", day90: "" };
  requireTimestamp(plannedPublicationAt, "planned publication time");
  const date = plannedPublicationAt.slice(0, 10);
  return { day7: addDays(date, 7), day30: addDays(date, 30), day90: addDays(date, 90) };
}

function defaultExperiment(config: CampaignConfig): Required<ExperimentConfig> {
  return config.experiment ?? {
    id: `${config.campaignId ?? "campaign"}_experiment`,
    startDate: "2026-08-17",
    timezone: "America/Chicago",
    publicationTime: "09:00:00-05:00",
    utmCampaign: "philippines_arrival_kit",
  };
}

export function buildExperimentPins(config: CampaignConfig, sourcePins: SourcePin[]): ExperimentPin[] {
  const campaignId = config.campaignId ?? "philippines_arrival_kit";
  const experiment = defaultExperiment(config);
  requireDate(experiment.startDate, "experiment start date");
  if (!/^\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(experiment.publicationTime)) throw new Error(`Invalid publication time: ${experiment.publicationTime}.`);
  requireHttpUrl(config.destinationUrl, "campaign destination URL");
  const imageCampaignSlug = config.publicImageCampaignSlug ?? (config.campaignId === "philippines_arrival_kit" ? "philippines" : config.campaignId ?? "campaign");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(imageCampaignSlug)) throw new Error(`Invalid public image campaign slug: ${imageCampaignSlug}.`);

  const isPhilippinesSprint = campaignId === "philippines_arrival_kit" && sourcePins.length === 25;
  const assignments: Assignment[] = isPhilippinesSprint ? philippinesAssignments : sourcePins.map((pin) => ({
    sourceConceptId: pin.id,
    topicPillar: "offline_preparation" as TopicPillar,
    primarySearchPhrase: pin.keywords[0] ?? pin.title,
    travelerIntent: "prepare_offline" as TravelerIntent,
    creativeFormat: "saveable_checklist" as CreativeFormat,
  }));
  const bySourceId = new Map(sourcePins.map((pin) => [pin.id, pin]));

  const pins = assignments.map((assignment, index) => {
    const number = index + 1;
    const source = bySourceId.get(assignment.sourceConceptId);
    if (!source) throw new Error(`Experiment assignment ${number} references unknown source concept ${assignment.sourceConceptId}.`);
    const scheduled = isPhilippinesSprint && number <= 20;
    const week = scheduled ? Math.floor(index / 5) + 1 : null;
    const slot = scheduled ? (index % 5) + 1 : null;
    const plannedDate = scheduled ? addDays(experiment.startDate, ((week ?? 1) - 1) * 7 + ((slot ?? 1) - 1)) : "";
    const plannedPublicationAt = plannedDate ? `${plannedDate}T${experiment.publicationTime}` : "";
    const title = number === 1 && isPhilippinesSprint ? "Philippines eSIM Setup in 5 Minutes" : source.title;
    const normalizedSource = { ...source, id: number, title };
    const onImageText = number === 1 && isPhilippinesSprint ? "PHILIPPINES eSIM SETUP IN 5 MINUTES" : extractOverlayText(normalizedSource);
    const filename = pinFilename(normalizedSource);
    const secondaryKeywords = source.keywords.filter((keyword) => keyword.toLowerCase() !== assignment.primarySearchPhrase.toLowerCase());
    return {
      ...normalizedSource,
      destinationUrl: trackedDestinationUrl(config.destinationUrl, number, experiment.utmCampaign),
      pinId: pinId(number),
      sourceConceptId: assignment.sourceConceptId,
      campaignId,
      experimentId: experiment.id,
      testWeek: week,
      scheduleSlot: slot,
      isReserve: !scheduled,
      topicPillar: assignment.topicPillar,
      primarySearchPhrase: assignment.primarySearchPhrase,
      secondaryKeywords,
      travelerIntent: assignment.travelerIntent,
      creativeFormat: assignment.creativeFormat,
      hook: onImageText,
      onImageText,
      callToAction: config.callToAction ?? "Learn more",
      topicTags: [...new Set([assignment.primarySearchPhrase, ...source.keywords])],
      altText: `${title}. ${onImageText}. StampdUp Travel Philippines arrival planning graphic.`,
      imageFilename: filename,
      imagePublicUrl: `https://travel.stampdup.com/pins/${imageCampaignSlug}/${filename}`,
      baseDestinationUrl: config.destinationUrl,
      trackedDestinationUrl: trackedDestinationUrl(config.destinationUrl, number, experiment.utmCampaign),
      plannedPublicationAt,
      publicationStatus: number === 1 && isPhilippinesSprint ? "created" as const : scheduled ? "planned" as const : "reserve" as const,
      publishedPinUrl: "",
      reviewDates: reviewDates(plannedPublicationAt),
      experimentNotes: assignment.notes ?? (week ? `Week ${week}, slot ${slot}.` : ""),
    };
  });
  validateExperimentPins(pins);
  return pins;
}

export function validateExperimentPins(pins: ExperimentPin[]): void {
  const seenPinIds = new Set<string>();
  const seenAssignments = new Set<string>();
  const seenSourceConcepts = new Set<number>();
  const seenTracking = new Set<string>();
  for (const pin of pins) {
    validatePinId(pin.pinId);
    if (seenPinIds.has(pin.pinId)) throw new Error(`Duplicate Pin ID: ${pin.pinId}.`);
    seenPinIds.add(pin.pinId);
    const assignment = `${pin.experimentId}:${pin.pinId}`;
    if (seenAssignments.has(assignment)) throw new Error(`Duplicate experiment assignment: ${assignment}.`);
    seenAssignments.add(assignment);
    if (seenSourceConcepts.has(pin.sourceConceptId)) throw new Error(`Duplicate source concept assignment: ${pin.sourceConceptId}.`);
    seenSourceConcepts.add(pin.sourceConceptId);
    if (!Number.isInteger(pin.id) || pin.id < 1) throw new Error(`Invalid numeric Pin ID: ${pin.id}.`);
    if (!pin.campaignId || !pin.experimentId || !pin.title || !pin.description || !pin.board || !pin.altText) throw new Error(`Malformed Pin record: ${pin.pinId} has missing required text.`);
    requireHttpUrl(pin.baseDestinationUrl, `${pin.pinId} base destination URL`);
    requireHttpUrl(pin.trackedDestinationUrl, `${pin.pinId} tracked destination URL`);
    if (pin.publishedPinUrl) requireHttpUrl(pin.publishedPinUrl, `${pin.pinId} published Pin URL`);
    if (pin.plannedPublicationAt) requireTimestamp(pin.plannedPublicationAt, `${pin.pinId} planned publication time`);
    for (const [window, date] of Object.entries(pin.reviewDates)) if (date) requireDate(date, `${pin.pinId} ${window} review date`);
    if (pin.testWeek !== null && (!Number.isInteger(pin.testWeek) || pin.testWeek < 1 || pin.testWeek > 4)) throw new Error(`Invalid test week for ${pin.pinId}: ${pin.testWeek}.`);
    if (pin.id === 1 && new URL(pin.trackedDestinationUrl).searchParams.has("utm_content")) throw new Error("Pin #1 must remain the untagged baseline.");
    if (pin.id > 1) {
      const content = new URL(pin.trackedDestinationUrl).searchParams.get("utm_content");
      if (content !== pin.pinId) throw new Error(`${pin.pinId} has invalid utm_content: ${content}.`);
      if (seenTracking.has(content)) throw new Error(`Duplicate utm_content: ${content}.`);
      seenTracking.add(content);
    }
  }
}

export function experimentConfig(config: CampaignConfig): Required<ExperimentConfig> {
  return defaultExperiment(config);
}
