#!/usr/bin/env node
import { Command } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rowsToCsv } from "./csv.js";
import { buildExperimentPins, experimentConfig, extractOverlayText, pinFilename, type CampaignConfig, type ExperimentPin, type SourcePin } from "./experiment.js";
import { buildCampaignReport, campaignReportMarkdown, emptyPerformanceStore, mergePerformanceSnapshots, parsePerformanceImport, validatePerformanceStore, type PerformanceStore, type ReviewWindow } from "./performance.js";
import { toPinterestBulkCsv, type PinterestBulkSchedule } from "./pinterest-bulk.js";

type Pin = SourcePin;

const sample: CampaignConfig = {
  name: "My Pinterest Campaign",
  brand: "My Brand",
  audience: "people interested in my topic",
  goal: "Drive traffic to my website",
  destinationUrl: "https://example.com",
  keywords: ["inspiration", "ideas", "tips"],
  boards: ["Ideas and Inspiration"],
  pinCount: 6,
  callToAction: "Learn more",
};

function validate(input: unknown): CampaignConfig {
  if (!input || typeof input !== "object") throw new Error("Config must be a JSON object.");
  const value = input as Record<string, unknown>;
  const required = ["name", "brand", "audience", "goal", "destinationUrl"] as const;
  for (const key of required) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      throw new Error(`Config field \"${key}\" must be a non-empty string.`);
    }
  }
  for (const key of ["keywords", "boards"] as const) {
    if (!Array.isArray(value[key]) || value[key].length === 0 || !value[key].every((item) => typeof item === "string")) {
      throw new Error(`Config field \"${key}\" must be a non-empty string array.`);
    }
  }
  if (value.pinCount !== undefined && (!Number.isInteger(value.pinCount) || (value.pinCount as number) < 1 || (value.pinCount as number) > 100)) {
    throw new Error('Config field "pinCount" must be an integer from 1 to 100.');
  }
  if (value.campaignId !== undefined && (typeof value.campaignId !== "string" || !/^[a-z0-9_]+$/.test(value.campaignId))) {
    throw new Error('Config field "campaignId" must use lowercase letters, numbers, and underscores.');
  }
  if (value.publicImageCampaignSlug !== undefined && (typeof value.publicImageCampaignSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.publicImageCampaignSlug))) {
    throw new Error('Config field "publicImageCampaignSlug" must be a lowercase URL slug.');
  }
  if (value.pinterestBulkSchedule !== undefined) {
    if (!value.pinterestBulkSchedule || typeof value.pinterestBulkSchedule !== "object") throw new Error('Config field "pinterestBulkSchedule" must be an object.');
    const schedule = value.pinterestBulkSchedule as Record<string, unknown>;
    if (typeof schedule.startDate !== "string" || typeof schedule.timezone !== "string") throw new Error("Pinterest bulk startDate and timezone must be strings.");
    if (!Array.isArray(schedule.dailyTimes) || schedule.dailyTimes.length === 0 || !schedule.dailyTimes.every((time) => typeof time === "string")) throw new Error("Pinterest bulk dailyTimes must be a non-empty string array.");
    if (!Number.isInteger(schedule.pinsPerDay)) throw new Error("Pinterest bulk pinsPerDay must be an integer.");
    if (schedule.includePinIds !== undefined && (!Array.isArray(schedule.includePinIds) || !schedule.includePinIds.every((pinId) => typeof pinId === "string"))) throw new Error("Pinterest bulk includePinIds must be a string array.");
  }
  if (value.experiment !== undefined) {
    if (!value.experiment || typeof value.experiment !== "object") throw new Error('Config field "experiment" must be an object.');
    const experiment = value.experiment as Record<string, unknown>;
    for (const key of ["id", "startDate", "timezone", "publicationTime", "utmCampaign"]) {
      if (typeof experiment[key] !== "string" || experiment[key].trim() === "") throw new Error(`Config experiment field "${key}" must be a non-empty string.`);
    }
  }
  return value as CampaignConfig;
}

function generatePins(config: CampaignConfig): Pin[] {
  const count = config.pinCount ?? 6;
  const cta = config.callToAction ?? "Learn more";
  const campaignText = [config.name, config.goal, ...config.keywords].join(" ").toLowerCase();
  const isPhilippinesArrival = campaignText.includes("philippines") &&
    (campaignText.includes("arrival") || campaignText.includes("esim"));

  if (isPhilippinesArrival) {
    const concepts: Array<Omit<Pin, "id" | "board" | "destinationUrl" | "keywords"> & { keywordIndexes: number[]; boardIndex: number }> = [
      {
        title: "Land in Manila With Data Already Working",
        description: `Getting connected is one part of a smooth arrival. This practical ${config.brand} guide covers Philippines eSIM prep alongside maps, ride apps, hotel details, and the other essentials worth organizing before you land. ${cta}.`,
        creativeBrief: "Use a bright Manila airport-arrival photo with a traveler checking a phone. Overlay: “LAND WITH DATA READY” in large type and “Philippines eSIM setup” beneath it. Add small map-pin, ride-app, and message icons; keep the phone screen readable and the brand mark subtle.",
        keywordIndexes: [0, 5, 4], boardIndex: 0,
      },
      {
        title: "Set Up Your Philippines eSIM Before Takeoff",
        description: `A little prep at home can save valuable time after landing. See when to install your eSIM, what to screenshot, and which settings to check before your flight to the Philippines. ${cta}.`,
        creativeBrief: "Create a clean pre-flight flat lay: passport, boarding pass, phone, and earbuds. Overlay: “SET UP BEFORE TAKEOFF” with a three-step mini timeline: Check → Install → Activate on arrival. Use tropical blue and warm yellow accents and no provider or purchase cues.",
        keywordIndexes: [0, 2, 4], boardIndex: 3,
      },
      {
        title: "Philippines eSIM Setup: The 5-Minute Version",
        description: `New to eSIMs? This simple setup flow covers installation, data-line selection, roaming settings, and the moment to activate—without the tech jargon. Save it before your Philippines trip so you can get connected with confidence. ${cta}.`,
        creativeBrief: "Design a vertical five-step phone tutorial with numbered panels and simple settings-screen illustrations. Headline: “PHILIPPINES eSIM IN 5 MINUTES.” Highlight “Don’t delete your primary SIM” in a contrasting tip box.",
        keywordIndexes: [0, 4, 2], boardIndex: 3,
      },
      {
        title: "What First-Time Visitors Need at Manila Airport",
        description: `Immigration, cash, transport, and mobile data are easier when you know the order. Use this Manila arrival plan to move through the airport smoothly and have your eSIM ready for directions and pickup messages. ${cta}.`,
        creativeBrief: "Build an airport-arrival checklist over a Manila terminal image. Overlay four bold checkpoints: Immigration, Bags, Cash, Connection. Circle “Connection” and add a small “eSIM ready” badge. Use clear, high-contrast type for mobile viewing.",
        keywordIndexes: [5, 1, 0], boardIndex: 0,
      },
      {
        title: "Physical SIM or eSIM for the Philippines?",
        description: `Not sure whether a physical SIM or eSIM fits your trip? Compare setup time, convenience, phone compatibility, and keeping your home number active as part of your Philippines arrival prep. ${cta}.`,
        creativeBrief: "Use a split-screen comparison: physical SIM and ejector tool on the left, eSIM QR code on a phone on the right. Overlay: “SIM vs eSIM” and include three short comparison rows: Setup, Convenience, Keep Your Number.",
        keywordIndexes: [4, 0, 2], boardIndex: 3,
      },
      {
        title: "Your Connected First 24 Hours in Manila",
        description: `From airport pickup to hotel check-in and your first food stop, reliable data keeps day one moving. Follow this practical Manila timeline for using maps, transport, translation, and messaging without hunting for Wi-Fi. ${cta}.`,
        creativeBrief: "Create a morning-to-night Manila itinerary with four photo tiles: airport, ride pickup, hotel, street food. Overlay: “YOUR FIRST 24 HOURS CONNECTED.” Add a thin route line linking each stop and tiny data-use icons.",
        keywordIndexes: [1, 5, 0], boardIndex: 0,
      },
      {
        title: "The Philippines Travel Checklist People Forget",
        description: `Passport and sunscreen are obvious—but offline backups, phone compatibility, eSIM installation, and arrival screenshots are easy to miss. Save this practical checklist for a less stressful Philippines departure day. ${cta}.`,
        creativeBrief: "Use a suitcase packing scene with an oversized checklist card. Headline: “DON’T FORGET THESE 7 THINGS.” Visually emphasize phone unlocked, eSIM installed, offline copies, and power bank with checked boxes.",
        keywordIndexes: [2, 0, 5], boardIndex: 2,
      },
      {
        title: "How Much Mobile Data Do You Need in the Philippines?",
        description: `A maps-and-messaging traveler uses data differently from a remote worker uploading files. Compare light, everyday, and heavy-use scenarios, then add the right data prep to your arrival checklist. ${cta}.`,
        creativeBrief: "Design three educational usage cards labeled Light, Everyday, and Heavy. Add icons for chat/maps, social/video, and hotspot/work. Overlay: “HOW MUCH DATA?” and avoid prices, provider logos, product badges, or purchase language.",
        keywordIndexes: [4, 0, 3], boardIndex: 3,
      },
      {
        title: "Your First 72 Hours in the Philippines",
        description: `The first three days are easier with a simple plan for airport transport, cash, connectivity, hotel check-in, and useful apps. Use this practical timeline to get settled without trying to solve everything after landing. ${cta}.`,
        creativeBrief: "Create a three-day arrival timeline with Day 1, Day 2, and Day 3 panels. Use practical icons for airport transfer, ATM/cash, eSIM, apps, and orientation. Overlay: “YOUR FIRST 72 HOURS” and make it feel like a useful checklist, not an advertisement.",
        keywordIndexes: [4, 5, 7], boardIndex: 0,
      },
      {
        title: "Manila Airport to Your Hotel: Know Your Options",
        description: `Plan your route from the airport before you land. Compare pickup points, ride apps, official transport options, payment prep, and the hotel details to keep offline so arrival feels less confusing. ${cta}.`,
        creativeBrief: "Build a clear Manila airport-to-hotel route graphic with generic icons for pickup, official taxi, ride app, and hotel. Overlay: “AIRPORT TO HOTEL” and include a reminder to save the address offline. Keep the layout informational and provider-neutral.",
        keywordIndexes: [7, 1, 5], boardIndex: 0,
      },
      {
        title: "Philippines Cash and ATM Prep Before You Land",
        description: `Arrive with a plan for cards, cash, ATM access, small bills, and bank travel notices. This checklist helps you organize the money basics before the airport, without relying on one payment method. ${cta}.`,
        creativeBrief: "Design a clean money-prep checklist with a wallet, card, ATM, Philippine peso notes, and bank-notification icon. Overlay: “CASH + ATM PREP” with four short checks. Keep it educational and avoid exchange-rate or fee claims.",
        keywordIndexes: [6, 2, 5], boardIndex: 2,
      },
      {
        title: "9 Philippines Arrival Mistakes to Avoid",
        description: `Landing without an offline hotel address, transport plan, usable payment option, or phone setup creates avoidable stress. Review these common arrival mistakes and prepare the essentials while you still have reliable Wi-Fi. ${cta}.`,
        creativeBrief: "Create a saveable mistake-and-fix layout using nine compact icons for documents, cash, transport, connectivity, apps, and offline backups. Overlay: “AVOID THESE ARRIVAL MISTAKES.” Use helpful check marks and neutral language instead of urgency or sales cues.",
        keywordIndexes: [5, 7, 6], boardIndex: 2,
      },
      {
        title: "A Digital Nomad’s Philippines Connectivity Plan",
        description: `Remote work in the Philippines takes more than finding a photogenic café. Plan your primary connection, backup data, hotspot use, charging, and work-call locations before settling in. ${cta}.`,
        creativeBrief: "Show a laptop-and-phone workspace with a tropical Philippines view. Overlay: “NOMAD CONNECTION PLAN” and a visual stack: Wi-Fi + eSIM backup + power. Keep it professional, realistic, and free of unsupported speed claims.",
        keywordIndexes: [3, 0, 4], boardIndex: 1,
      },
      {
        title: "Your Backup Internet Plan for Remote Work",
        description: `Hotel and café Wi-Fi can be unpredictable when a meeting matters. A Philippines eSIM can add a practical backup for messages, maps, and hotspot use when you need another way online. Check device and plan terms before relying on tethering. ${cta}.`,
        creativeBrief: "Create a calm remote-work scene with a laptop video call and phone hotspot symbol. Overlay: “WHEN WI-FI DROPS…” then “Have a backup connection.” Add a small responsible note: “Check hotspot support and data limits.”",
        keywordIndexes: [3, 4, 0], boardIndex: 1,
      },
      {
        title: "Can You Keep Your Home Number With an eSIM?",
        description: `Many travelers want local data while keeping their usual number available for important texts. Learn how dual-SIM phones can separate mobile data from calls and messages—and what to check with your home carrier before leaving. ${cta}.`,
        creativeBrief: "Use a phone graphic with two clearly labeled lines: Home SIM and Philippines eSIM. Overlay: “KEEP YOUR NUMBER?” Add arrows showing Home SIM for calls/texts and eSIM for travel data. Avoid implying every device or carrier behaves identically.",
        keywordIndexes: [0, 4, 2], boardIndex: 3,
      },
      {
        title: "Is Your Phone Ready for a Philippines eSIM?",
        description: `Before travel, confirm that your phone supports eSIM and is carrier-unlocked. This two-minute compatibility check can prevent setup surprises and belongs on any Philippines arrival checklist. ${cta}.`,
        creativeBrief: "Design a phone compatibility checklist with two oversized checks: “eSIM supported?” and “Carrier unlocked?” Overlay: “CHECK BEFORE YOU FLY.” Include small iOS/Android settings-path cues without copying a specific device screen exactly.",
        keywordIndexes: [4, 0, 2], boardIndex: 3,
      },
      {
        title: "Don’t Make These 5 eSIM Setup Mistakes",
        description: `Installing too late, deleting the eSIM, choosing the wrong data line, or forgetting roaming settings can derail an otherwise easy setup. Save these common fixes before your flight and keep the activation instructions handy. ${cta}.`,
        creativeBrief: "Create five concise mistake/fix pairs with red X and green check icons. Headline: “AVOID THESE eSIM MISTAKES.” Make “Don’t delete it after installation” the strongest callout and use a phone-settings background.",
        keywordIndexes: [0, 4, 2], boardIndex: 3,
      },
      {
        title: "When Should You Activate a Philippines eSIM?",
        description: `Install now or wait until landing? The answer can depend on when a plan’s validity begins. Review the provider instructions, prepare on Wi-Fi, and know the activation trigger before travel day. ${cta} after checking the plan details.`,
        creativeBrief: "Use a simple two-part timeline: “Before departure: install + save instructions” and “On arrival: activate + select data line.” Headline: “WHEN TO ACTIVATE?” Add a visible reminder: “Plan rules vary—check first.”",
        keywordIndexes: [0, 4, 5], boardIndex: 3,
      },
      {
        title: "Save This Offline Before Flying to Manila",
        description: `Even with an eSIM ready, smart travelers keep offline copies of the essentials. Save your QR code instructions, hotel address, airport pickup details, passport copy, and first route before boarding. ${cta}.`,
        creativeBrief: "Design a “save offline” phone folder with five document thumbnails: eSIM instructions, hotel, pickup, passport, route. Overlay: “SCREENSHOT BEFORE YOU FLY.” Use a Manila skyline footer and a prominent download icon.",
        keywordIndexes: [5, 1, 2], boardIndex: 2,
      },
      {
        title: "Essential Apps for Your First Philippines Trip",
        description: `Set up the apps you may need for navigation, transport, translation, weather, bookings, and messaging before you arrive. Pair them with travel data so they are useful when you step away from airport or hotel Wi-Fi. ${cta}.`,
        creativeBrief: "Show a phone home screen made of six generic, non-branded app tiles: Maps, Rides, Translate, Weather, Bookings, Messages. Overlay: “DOWNLOAD BEFORE YOU GO” with a Philippines map silhouette behind the phone.",
        keywordIndexes: [2, 1, 0], boardIndex: 2,
      },
      {
        title: "Why Airport Wi-Fi Shouldn’t Be Your Only Plan",
        description: `Public Wi-Fi may help in a pinch, but login pages, coverage gaps, and security concerns can slow down an already busy arrival. Prepare a mobile-data option before landing so directions and pickup messages do not depend on one network. ${cta}.`,
        creativeBrief: "Use an airport scene with a weak Wi-Fi icon on one side and a connected phone on the other. Overlay: “DON’T RELY ON AIRPORT WI-FI.” Add three small pain points: Login • Gaps • Privacy, without fear-based imagery.",
        keywordIndexes: [5, 0, 4], boardIndex: 3,
      },
      {
        title: "Useful Apps to Set Up for a Philippines Arrival",
        description: `Navigation, airport transport, translation, weather, bookings, and messaging are more useful when they are installed and signed in before landing. Add these app categories and offline backups to your pre-flight setup. ${cta}.`,
        creativeBrief: "Create an organized phone setup board with generic tiles for maps, rides, translation, weather, bookings, and messages. Overlay: “SET UP BEFORE LANDING.” Keep all icons generic and make the visual a checklist rather than an app endorsement.",
        keywordIndexes: [2, 6, 7], boardIndex: 0,
      },
      {
        title: "The Smart Way to Use Maps Without Burning Data",
        description: `Download key areas on Wi-Fi, save your hotel, and use mobile data for live changes when needed. This simple maps routine helps Philippines travelers stay oriented while making their data plan last longer. ${cta}.`,
        creativeBrief: "Show a Philippines map downloading onto a phone, then a live route pin. Overlay: “DOWNLOAD MAPS FIRST” and a three-step footer: Save area • Pin hotel • Go live when needed. Use strong map-green and ocean-blue contrast.",
        keywordIndexes: [0, 2, 1], boardIndex: 3,
      },
      {
        title: "Add These 6 eSIM Checks to Your Arrival Plan",
        description: `Review device compatibility, activation timing, data allowance, plan length, hotspot rules, and support before travel. A few minutes of preparation can prevent connectivity surprises during your arrival. ${cta}.`,
        creativeBrief: "Design six compact checklist cards around a phone: Compatibility, Activation, Data, Days, Hotspot, Support. Overlay: “6 eSIM PRE-FLIGHT CHECKS.” Use neutral educational visuals with no provider logos, prices, rankings, or purchase prompts.",
        keywordIndexes: [4, 0, 3], boardIndex: 3,
      },
      {
        title: "A Smoother Philippines Arrival Starts Before Landing",
        description: `Your hotel address is saved, airport transfer is confirmed, and mobile data is ready—so the first hour can focus on getting oriented instead of finding a connection. Use this final pre-flight check for an easier arrival. ${cta}.`,
        creativeBrief: "Use an airplane-window view approaching the Philippines with three checked cards floating beside a phone: Hotel saved, Transfer confirmed, eSIM ready. Overlay: “ARRIVE READY.” Finish with a warm, optimistic travel palette.",
        keywordIndexes: [5, 0, 2], boardIndex: 0,
      },
    ];

    return Array.from({ length: count }, (_, index) => {
      const concept = concepts[index % concepts.length];
      const cycle = Math.floor(index / concepts.length) + 1;
      return {
        id: index + 1,
        board: config.boards[concept.boardIndex % config.boards.length],
        title: cycle === 1 ? concept.title : `${concept.title} — Part ${cycle}`,
        description: concept.description.slice(0, 500),
        destinationUrl: config.destinationUrl,
        creativeBrief: concept.creativeBrief,
        keywords: concept.keywordIndexes.map((keywordIndex) => config.keywords[keywordIndex % config.keywords.length]),
      };
    });
  }

  const angles = [
    (keyword: string) => `${keyword}: What to Know Before You Start`,
    (keyword: string) => `The Practical Guide to ${keyword}`,
    (keyword: string) => `${keyword} Mistakes That Are Easy to Avoid`,
    (keyword: string) => `A Smarter Plan for ${keyword}`,
    (keyword: string) => `Save This Before You Choose ${keyword}`,
    (keyword: string) => `${keyword} Questions, Answered Clearly`,
  ];
  return Array.from({ length: count }, (_, index) => {
    const keyword = config.keywords[index % config.keywords.length];
    const title = angles[index % angles.length](keyword);
    return {
      id: index + 1,
      board: config.boards[index % config.boards.length],
      title: title.slice(0, 100),
      description: `Planning around ${keyword}? ${config.brand} created this useful starting point for ${config.audience}. Use it to make a more informed decision and move closer to your goal: ${config.goal.toLowerCase()}. ${cta}.`.slice(0, 500),
      destinationUrl: config.destinationUrl,
      creativeBrief: `Create a vertical 2:3 editorial pin focused on “${keyword}.” Use one relevant hero image, a short version of “${title}” as the text overlay, and one supporting visual cue that makes the takeaway obvious. Prioritize mobile legibility, useful specificity, and a subtle ${config.brand} mark.`,
      keywords: [keyword, ...config.keywords.filter((item) => item !== keyword).slice(0, 2)],
    };
  });
}

function toPinsCsv(pins: ExperimentPin[]): string {
  const header = ["id", "pin_id", "campaign_id", "experiment_id", "test_week", "topic_pillar", "primary_search_phrase", "secondary_keywords", "traveler_intent", "creative_format", "hook", "on_image_text", "title", "description", "call_to_action", "board", "topic_tags", "alt_text", "image_filename", "image_public_url", "base_destination_url", "tracked_destination_url", "destination_url", "planned_publication_at", "publication_status", "published_pin_url", "review_7_date", "review_30_date", "review_90_date", "experiment_notes", "creative_brief", "keywords"];
  const rows = pins.map((pin) => [pin.id, pin.pinId, pin.campaignId, pin.experimentId, pin.testWeek, pin.topicPillar, pin.primarySearchPhrase, pin.secondaryKeywords.join(" | "), pin.travelerIntent, pin.creativeFormat, pin.hook, pin.onImageText, pin.title, pin.description, pin.callToAction, pin.board, pin.topicTags.join(" | "), pin.altText, pin.imageFilename, pin.imagePublicUrl, pin.baseDestinationUrl, pin.trackedDestinationUrl, pin.trackedDestinationUrl, pin.plannedPublicationAt, pin.publicationStatus, pin.publishedPinUrl, pin.reviewDates.day7, pin.reviewDates.day30, pin.reviewDates.day90, pin.experimentNotes, pin.creativeBrief, pin.keywords.join(" | ")]);
  return rowsToCsv([header, ...rows]);
}

function visualStyle(creativeBrief: string): string {
  const text = creativeBrief.toLowerCase();
  if (text.includes("checklist") || text.includes("check ")) return "Editorial travel checklist, clean icons, high contrast, vertical 2:3";
  if (text.includes("timeline") || text.includes("itinerary")) return "Editorial travel timeline, clear stages, mobile-first, vertical 2:3";
  if (text.includes("tutorial") || text.includes("settings")) return "Clean mobile tutorial, simple UI illustrations, vertical 2:3";
  if (text.includes("photo") || text.includes("scene") || text.includes("workspace")) return "Warm editorial travel photography, bold readable type, vertical 2:3";
  return "Modern editorial travel graphic, useful and mobile-readable, vertical 2:3";
}

function imagePrompt(pin: ExperimentPin): string {
  return `Create a Pinterest pin in vertical 2:3 format. ${pin.creativeBrief}`;
}

function subtitle(pin: ExperimentPin): string {
  const firstSentence = pin.description.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? pin.keywords.join(" • ");
  if (firstSentence.length <= 120) return firstSentence;
  const shortened = firstSentence.slice(0, 117).replace(/\s+\S*$/, "").trimEnd();
  return `${shortened}...`;
}

function toImagePromptsCsv(pins: ExperimentPin[]): string {
  const header = ["id", "title", "destination_url", "image_prompt", "overlay_text", "visual_style", "filename_slug"];
  const rows = pins.map((pin) => [
    pin.id,
    pin.title,
    pin.destinationUrl,
    imagePrompt(pin),
    extractOverlayText(pin),
    visualStyle(pin.creativeBrief),
    pinFilename(pin),
  ]);
  return rowsToCsv([header, ...rows]);
}

function toCanvaBulkCreateCsv(pins: ExperimentPin[], config: CampaignConfig): string {
  const header = ["filename", "title", "subtitle", "overlay_text", "destination_url", "visual_prompt", "brand", "category"];
  const rows = pins.map((pin) => [
    pinFilename(pin),
    pin.title,
    subtitle(pin),
    extractOverlayText(pin),
    pin.destinationUrl,
    imagePrompt(pin),
    config.brand,
    pin.board,
  ]);
  return rowsToCsv([header, ...rows]);
}

const brandNotes = "Practical, calm, modern, trustworthy, destination-specific, helpful, no hype, no fake urgency.";

function toPinImageProductionJson(pins: ExperimentPin[], config: CampaignConfig): string {
  const productionPins = pins.map((pin) => {
    const pinOverlay = extractOverlayText(pin);
    const pinVisualStyle = visualStyle(pin.creativeBrief);
    return {
      id: pin.id,
      filename: pinFilename(pin),
      board: pin.board,
      title: pin.title,
      description: pin.description,
      destination_url: pin.destinationUrl,
      overlay_text: pinOverlay,
      image_prompt: `Create a finished 1000x1500 pixel Pinterest pin as a PNG for ${config.brand}. ${pin.creativeBrief} Use the exact overlay text “${pinOverlay}”. Visual style: ${pinVisualStyle}. Brand direction: ${brandNotes} Keep all text highly legible on mobile, maintain clear visual hierarchy, and return one production-ready pin image without mockup framing.`,
      visual_style: pinVisualStyle,
      brand: config.brand,
      brand_notes: brandNotes,
      size: "1000x1500",
      format: "png",
      status: "draft",
    };
  });
  return JSON.stringify(productionPins, null, 2) + "\n";
}

function toManualPostingCsv(pins: ExperimentPin[]): string {
  const header = ["id", "pin_id", "image_filename", "image_public_url", "board", "title", "description", "destination_url", "base_destination_url", "tracked_destination_url", "alt_text", "topic_tags", "planned_publication_at", "publication_status", "published_pin_url", "campaign_id", "experiment_id", "test_week", "topic_pillar", "primary_search_phrase", "secondary_keywords", "traveler_intent", "creative_format", "hook", "on_image_text", "call_to_action", "review_7_date", "review_30_date", "review_90_date", "experiment_notes"];
  const rows = pins.map((pin) => [
    pin.id,
    pin.pinId,
    pin.imageFilename,
    pin.imagePublicUrl,
    pin.board,
    pin.title,
    pin.description,
    pin.trackedDestinationUrl,
    pin.baseDestinationUrl,
    pin.trackedDestinationUrl,
    pin.altText,
    pin.topicTags.join(" | "),
    pin.plannedPublicationAt,
    pin.publicationStatus,
    pin.publishedPinUrl,
    pin.campaignId,
    pin.experimentId,
    pin.testWeek,
    pin.topicPillar,
    pin.primarySearchPhrase,
    pin.secondaryKeywords.join(" | "),
    pin.travelerIntent,
    pin.creativeFormat,
    pin.hook,
    pin.onImageText,
    pin.callToAction,
    pin.reviewDates.day7,
    pin.reviewDates.day30,
    pin.reviewDates.day90,
    pin.experimentNotes,
  ]);
  return rowsToCsv([header, ...rows]);
}

function toExperimentScheduleCsv(pins: ExperimentPin[]): string {
  const header = ["pin_id", "source_concept_id", "test_week", "schedule_slot", "reserve", "planned_publication_at", "publication_status", "topic_pillar", "primary_search_phrase", "traveler_intent", "creative_format", "hook", "on_image_text", "title", "board", "tracked_destination_url", "review_7_date", "review_30_date", "review_90_date", "experiment_notes"];
  const rows = pins.map((pin) => [pin.pinId, pin.sourceConceptId, pin.testWeek, pin.scheduleSlot, pin.isReserve ? "yes" : "no", pin.plannedPublicationAt, pin.publicationStatus, pin.topicPillar, pin.primarySearchPhrase, pin.travelerIntent, pin.creativeFormat, pin.hook, pin.onImageText, pin.title, pin.board, pin.trackedDestinationUrl, pin.reviewDates.day7, pin.reviewDates.day30, pin.reviewDates.day90, pin.experimentNotes]);
  return rowsToCsv([header, ...rows]);
}

function toPerformanceEntryCsv(pins: ExperimentPin[]): string {
  const header = ["pin_id", "review_window", "review_date", "impressions", "saves", "pin_clicks", "outbound_clicks", "arrival_kit_visits", "checklist_opens", "checklist_downloads", "print_actions", "email_signups", "affiliate_clicks", "affiliate_revenue", "notes"];
  const rows = pins.filter((pin) => !pin.isReserve).flatMap((pin) => ([
    [pin.pinId, "7", pin.reviewDates.day7, "", "", "", "", "", "", "", "", "", "", "", ""],
    [pin.pinId, "30", pin.reviewDates.day30, "", "", "", "", "", "", "", "", "", "", "", ""],
    [pin.pinId, "90", pin.reviewDates.day90, "", "", "", "", "", "", "", "", "", "", "", ""],
  ]));
  return rowsToCsv([header, ...rows]);
}

function experimentManifest(config: CampaignConfig, pins: ExperimentPin[]): object {
  const experiment = experimentConfig(config);
  return {
    schemaVersion: 1,
    campaign: {
      id: config.campaignId ?? "philippines_arrival_kit",
      name: config.name,
      baseDestinationUrl: config.destinationUrl,
    },
    experiment: {
      id: experiment.id,
      startDate: experiment.startDate,
      timezone: experiment.timezone,
      publicationTime: experiment.publicationTime,
      utmCampaign: experiment.utmCampaign,
      baselinePinId: "pin_001",
      activePinCount: pins.filter((pin) => !pin.isReserve).length,
      reservePinCount: pins.filter((pin) => pin.isReserve).length,
      policy: "Five Pins per week for four weeks; five additional concepts remain in reserve.",
    },
    pins,
  };
}

type GenerateOptions = { config: string; output: string; bulkStartDate?: string; bulkTimezone?: string; bulkTimes?: string; bulkPinsPerDay?: string };

function bulkScheduleOverrides(options: GenerateOptions): Partial<PinterestBulkSchedule> {
  const overrides: Partial<PinterestBulkSchedule> = {};
  if (options.bulkStartDate) overrides.startDate = options.bulkStartDate;
  if (options.bulkTimezone) overrides.timezone = options.bulkTimezone;
  if (options.bulkTimes) overrides.dailyTimes = options.bulkTimes.split(",").map((value) => value.trim()).filter(Boolean);
  if (options.bulkPinsPerDay) {
    const value = Number(options.bulkPinsPerDay);
    if (!Number.isInteger(value)) throw new Error("--bulk-pins-per-day must be an integer.");
    overrides.pinsPerDay = value;
  }
  return overrides;
}

async function writeCampaignOutputs(options: GenerateOptions, action: "Generated" | "Exported"): Promise<void> {
  const { config: configFile, output } = options;
  const config = validate(JSON.parse(await readFile(path.resolve(configFile), "utf8")));
  const sourcePins = generatePins(config);
  const pins = buildExperimentPins(config, sourcePins);
  const outputDir = path.resolve(output);
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, "campaign.json"), JSON.stringify({ campaign: config, pins }, null, 2) + "\n"),
    writeFile(path.join(outputDir, "pins.csv"), toPinsCsv(pins)),
    writeFile(path.join(outputDir, "image-prompts.csv"), toImagePromptsCsv(pins)),
    writeFile(path.join(outputDir, "manual-posting.csv"), toManualPostingCsv(pins)),
    writeFile(path.join(outputDir, "canva-bulk-create.csv"), toCanvaBulkCreateCsv(pins, config)),
    writeFile(path.join(outputDir, "pin-image-production.json"), toPinImageProductionJson(pins, config)),
    writeFile(path.join(outputDir, "experiment-schedule.csv"), toExperimentScheduleCsv(pins)),
    writeFile(path.join(outputDir, "performance-entry.csv"), toPerformanceEntryCsv(pins)),
    writeFile(path.join(outputDir, "experiment-manifest.json"), JSON.stringify(experimentManifest(config, pins), null, 2) + "\n"),
    writeFile(path.join(outputDir, "pinterest-bulk-upload.csv"), toPinterestBulkCsv(pins, config, bulkScheduleOverrides(options))),
  ]);
  console.log(`${action} ${pins.length} pins and automation exports in ${outputDir}`);
}

async function readPerformanceStore(storeFile: string): Promise<PerformanceStore> {
  try {
    return validatePerformanceStore(JSON.parse(await readFile(path.resolve(storeFile), "utf8")));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyPerformanceStore();
    throw error;
  }
}

type PerformanceImportOptions = { input: string; manifest: string; store: string };

async function importPerformance(options: PerformanceImportOptions): Promise<void> {
  const manifest = JSON.parse(await readFile(path.resolve(options.manifest), "utf8")) as { pins?: Array<{ pinId?: string }> };
  if (!Array.isArray(manifest.pins)) throw new Error("Experiment manifest is missing its pins array. Run campaign:export first.");
  const validPinIds = new Set(manifest.pins.map((pin) => pin.pinId).filter((value): value is string => typeof value === "string"));
  const imported = parsePerformanceImport(await readFile(path.resolve(options.input), "utf8"), validPinIds);
  const existing = await readPerformanceStore(options.store);
  const result = mergePerformanceSnapshots(existing, imported);
  const storePath = path.resolve(options.store);
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(result.store, null, 2) + "\n");
  console.log(`Performance import: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged; ${result.store.snapshots.length} stored snapshots.`);
}

type ReportOptions = { manifest: string; store: string; output: string; window: string; asOf?: string };

async function writeReport(options: ReportOptions): Promise<void> {
  const window = Number(options.window);
  if (window !== 7 && window !== 30 && window !== 90) throw new Error(`Report window must be 7, 30, or 90; received ${options.window}.`);
  const manifest = JSON.parse(await readFile(path.resolve(options.manifest), "utf8"));
  const store = await readPerformanceStore(options.store);
  const report = buildCampaignReport(manifest, store, window as ReviewWindow, options.asOf);
  const outputDir = path.resolve(options.output);
  await mkdir(outputDir, { recursive: true });
  const basename = `campaign-report-${window}d`;
  await Promise.all([
    writeFile(path.join(outputDir, `${basename}.json`), JSON.stringify(report, null, 2) + "\n"),
    writeFile(path.join(outputDir, `${basename}.md`), campaignReportMarkdown(report)),
  ]);
  console.log(`Wrote ${window}-day JSON and Markdown reports in ${outputDir}.`);
}

const program = new Command()
  .name("pinterest-engine")
  .description("Generate local Pinterest campaign plans and pin briefs")
  .version("0.1.0");

program.command("init")
  .description("Create a starter campaign config")
  .option("-o, --output <file>", "config path", "campaign.json")
  .action(async ({ output }: { output: string }) => {
    await writeFile(path.resolve(output), JSON.stringify(sample, null, 2) + "\n", { flag: "wx" });
    console.log(`Created ${path.resolve(output)}`);
  });

program.command("generate")
  .description("Generate campaign assets and automation-ready CSV exports")
  .option("-c, --config <file>", "campaign config", "campaign.json")
  .option("-o, --output <directory>", "output directory", "output")
  .option("--bulk-start-date <date>", "Pinterest bulk schedule start date (YYYY-MM-DD)")
  .option("--bulk-timezone <timezone>", "Pinterest bulk IANA timezone")
  .option("--bulk-times <times>", "Pinterest bulk local times, comma-separated HH:mm values")
  .option("--bulk-pins-per-day <count>", "Pinterest bulk Pins per day")
  .action((options: GenerateOptions) => writeCampaignOutputs(options, "Generated"));

program.command("export")
  .description("Export campaign assets for image creation and manual posting")
  .option("-c, --config <file>", "campaign config", "campaign.json")
  .option("-o, --output <directory>", "output directory", "output")
  .option("--bulk-start-date <date>", "Pinterest bulk schedule start date (YYYY-MM-DD)")
  .option("--bulk-timezone <timezone>", "Pinterest bulk IANA timezone")
  .option("--bulk-times <times>", "Pinterest bulk local times, comma-separated HH:mm values")
  .option("--bulk-pins-per-day <count>", "Pinterest bulk Pins per day")
  .action((options: GenerateOptions) => writeCampaignOutputs(options, "Exported"));

program.command("performance-import")
  .description("Import provider-neutral Pin performance snapshots")
  .requiredOption("-i, --input <file>", "performance CSV path")
  .option("-m, --manifest <file>", "experiment manifest path", "output/experiment-manifest.json")
  .option("-s, --store <file>", "performance snapshot store", "data/performance-snapshots.json")
  .action((options: PerformanceImportOptions) => importPerformance(options));

program.command("report")
  .description("Generate machine-readable and Markdown campaign reports")
  .option("-m, --manifest <file>", "experiment manifest path", "output/experiment-manifest.json")
  .option("-s, --store <file>", "performance snapshot store", "data/performance-snapshots.json")
  .option("-o, --output <directory>", "report output directory", "output/reports")
  .option("-w, --window <days>", "review window: 7, 30, or 90", "30")
  .option("--as-of <date>", "report as-of date (YYYY-MM-DD)")
  .action((options: ReportOptions) => writeReport(options));

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
