#!/usr/bin/env node
import { Command } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CampaignConfig = {
  name: string;
  brand: string;
  audience: string;
  goal: string;
  destinationUrl: string;
  keywords: string[];
  boards: string[];
  pinCount?: number;
  callToAction?: string;
};

type Pin = {
  id: number;
  board: string;
  title: string;
  description: string;
  destinationUrl: string;
  creativeBrief: string;
  keywords: string[];
};

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
  return value as CampaignConfig;
}

function generatePins(config: CampaignConfig): Pin[] {
  const count = config.pinCount ?? 6;
  const cta = config.callToAction ?? "Learn more";
  const angles = ["How-to", "Checklist", "Quick tips", "Fresh ideas", "Common mistakes", "Step-by-step guide"];
  return Array.from({ length: count }, (_, index) => {
    const keyword = config.keywords[index % config.keywords.length];
    const angle = angles[index % angles.length];
    return {
      id: index + 1,
      board: config.boards[index % config.boards.length],
      title: `${angle}: ${keyword}`.slice(0, 100),
      description: `${config.brand} helps ${config.audience} with ${keyword}. ${config.goal}. ${cta}.`.slice(0, 500),
      destinationUrl: config.destinationUrl,
      creativeBrief: `Create a vertical 2:3 pin for “${keyword}”. Lead with a clear ${angle.toLowerCase()} headline, high contrast type, brand-consistent colors, and a subtle ${config.brand} mark.`,
      keywords: [keyword, ...config.keywords.filter((item) => item !== keyword).slice(0, 2)],
    };
  });
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(pins: Pin[]): string {
  const header = ["id", "board", "title", "description", "destination_url", "creative_brief", "keywords"];
  const rows = pins.map((pin) => [pin.id, pin.board, pin.title, pin.description, pin.destinationUrl, pin.creativeBrief, pin.keywords.join(" | ")]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
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
  .description("Generate JSON and CSV campaign assets")
  .option("-c, --config <file>", "campaign config", "campaign.json")
  .option("-o, --output <directory>", "output directory", "output")
  .action(async ({ config: configFile, output }: { config: string; output: string }) => {
    const config = validate(JSON.parse(await readFile(path.resolve(configFile), "utf8")));
    const pins = generatePins(config);
    const outputDir = path.resolve(output);
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(outputDir, "campaign.json"), JSON.stringify({ campaign: config, pins }, null, 2) + "\n"),
      writeFile(path.join(outputDir, "pins.csv"), toCsv(pins)),
    ]);
    console.log(`Generated ${pins.length} pins in ${outputDir}`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
