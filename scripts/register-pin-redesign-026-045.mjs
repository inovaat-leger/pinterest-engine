import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const batchPath = "config/pin-batch-026-045.json";
const manifestPath = "config/pin-images.json";
const historyPath = "config/pin-image-history.json";
const batch = JSON.parse(await readFile(batchPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const history = JSON.parse(await readFile(historyPath, "utf8"));

for (const pin of batch.pins) {
  const pinId = `pin_${String(pin.id).padStart(3, "0")}`;
  if (pin.id < 26 || pin.id > 45) continue;
  const oldFilename = pin.filename;
  const filename = oldFilename.replace(/-v1\.png$/, "-v2.png");
  if (filename === oldFilename) throw new Error(`${pinId} does not have the expected retired v1 filename.`);
  const localPath = path.posix.join("public/pins/philippines", filename);
  const bytes = await readFile(localPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const canonical = manifest.images.find((image) => image.pinId === pinId);
  if (!canonical || canonical.filename !== oldFilename) throw new Error(`${pinId} canonical v1 identity is not the expected predecessor.`);
  const oldLock = history.routes.find((entry) => entry.campaign === "philippines" && entry.filename === oldFilename);
  if (!oldLock || oldLock.sha256 !== canonical.sha256) throw new Error(`${pinId} retired route is not locked in immutable history.`);
  if (history.routes.some((entry) => entry.campaign === "philippines" && entry.filename === filename)) throw new Error(`${filename} has already been used and cannot be reassigned.`);
  Object.assign(canonical, { filename, sourceFilename: filename, localPath, sha256 });
  history.routes.push({ campaign: "philippines", filename, localPath, sha256, firstSeenCommit: "redesign-026-045-v2" });
  pin.filename = filename;
}

await writeFile(batchPath, `${JSON.stringify(batch, null, 2)}\n`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`);
console.log("Registered 20 v2 redesigns while preserving every retired v1 route lock.");
