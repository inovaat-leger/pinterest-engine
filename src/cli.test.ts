import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { csvRecords } from "./csv.js";

const execFileAsync = promisify(execFile);

test("generate preserves existing outputs and adds complete experiment exports", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "pinterest-engine-test-"));
  await execFileAsync(process.execPath, [path.resolve("dist/cli.js"), "generate", "--config", path.resolve("campaign.json"), "--output", output]);

  const expectedFiles = [
    "campaign.json", "pins.csv", "image-prompts.csv", "manual-posting.csv",
    "canva-bulk-create.csv", "pin-image-production.json", "experiment-schedule.csv",
    "performance-entry.csv", "experiment-manifest.json",
    "pinterest-bulk-upload.csv", "stampdup-philippines-pinterest-v2-schedule.csv",
    "stampdup-philippines-v2-preflight.md",
  ];
  await Promise.all(expectedFiles.map((filename) => readFile(path.join(output, filename), "utf8")));

  const pins = csvRecords(await readFile(path.join(output, "pins.csv"), "utf8"));
  const manual = csvRecords(await readFile(path.join(output, "manual-posting.csv"), "utf8"));
  const schedule = csvRecords(await readFile(path.join(output, "experiment-schedule.csv"), "utf8"));
  const performance = csvRecords(await readFile(path.join(output, "performance-entry.csv"), "utf8"));
  const pinterestBulk = csvRecords(await readFile(path.join(output, "pinterest-bulk-upload.csv"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(output, "experiment-manifest.json"), "utf8"));

  assert.equal(pins.length, 25);
  assert.equal(manual.length, 25);
  assert.equal(schedule.filter((row) => row.reserve === "no").length, 20);
  assert.equal(schedule.filter((row) => row.reserve === "yes").length, 5);
  assert.equal(performance.length, 60);
  assert.equal(pinterestBulk.length, 20);
  assert.deepEqual(Object.keys(pinterestBulk[0]), ["Title", "Media URL", "Pinterest board", "Thumbnail", "Description", "Link", "Publish date", "Keywords"]);
  assert.equal(pinterestBulk[0].Title, "Land in Manila Connected");
  assert.equal(pinterestBulk[0]["Media URL"], "https://travel.stampdup.com/pins/philippines/land-in-manila-connected-v2.png");
  assert.deepEqual(pinterestBulk.map((row) => new URL(row.Link).searchParams.get("utm_content")), Array.from({ length: 20 }, (_, index) => `pin_${String(index + 6).padStart(3, "0")}`));
  assert.equal(await readFile(path.join(output, "stampdup-philippines-pinterest-v2-schedule.csv"), "utf8"), await readFile(path.join(output, "pinterest-bulk-upload.csv"), "utf8"));
  assert.match(await readFile(path.join(output, "stampdup-philippines-v2-preflight.md"), "utf8"), /pin_025.*Your First Manila Ride: 5 Pickup Checks.*PASS/);
  assert.equal(manifest.experiment.activePinCount, 20);
  assert.equal(manifest.experiment.reservePinCount, 5);
  assert.equal(pins[0].tracked_destination_url, "https://travel.stampdup.com/philippines-arrival-kit");
  assert.equal(new URL(pins[1].tracked_destination_url).searchParams.get("utm_content"), "pin_002");
  for (const row of manual) {
    assert.ok(row.pin_id);
    assert.ok(row.alt_text);
    assert.ok(row.experiment_id);
    assert.ok(row.publication_status);
  }
});
