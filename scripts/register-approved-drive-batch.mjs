import { readFile, writeFile } from "node:fs/promises";

const approved = JSON.parse(await readFile("config/pin-approved-drive-026-045.json", "utf8"));
const batch = JSON.parse(await readFile("config/pin-batch-026-045.json", "utf8"));
const manifest = JSON.parse(await readFile("config/pin-images.json", "utf8"));
const history = JSON.parse(await readFile("config/pin-image-history.json", "utf8"));
if (approved.schemaVersion !== 1 || approved.pins.length !== 20) throw new Error("Approved Drive batch must contain exactly 20 mappings.");

for (const approvedPin of approved.pins) {
  const number = Number(approvedPin.pinId.slice(4));
  const pin = batch.pins.find((entry) => entry.id === number);
  const identity = manifest.images.find((entry) => entry.pinId === approvedPin.pinId);
  if (!pin || !identity || identity.canonicalTitle !== pin.title) throw new Error(`${approvedPin.pinId} canonical metadata is missing.`);
  const existing = history.routes.find((entry) => entry.campaign === "philippines" && entry.filename === approvedPin.filename);
  if (existing) {
    if (existing.driveFileId !== approvedPin.driveFileId || existing.sha256 !== approvedPin.sha256) throw new Error(`${approvedPin.filename} immutable identity changed.`);
  } else {
    if (history.routes.some((entry) => entry.filename === approvedPin.filename)) throw new Error(`${approvedPin.filename} was previously used.`);
    history.routes.push({ campaign:"philippines", filename:approvedPin.filename, driveFileId:approvedPin.driveFileId, sha256:approvedPin.sha256, firstSeenCommit:"stage2-approved-drive-2026-08-22" });
  }
  Object.assign(identity, { filename:approvedPin.filename, sourceFilename:approvedPin.sourceFilename, driveFileId:approvedPin.driveFileId, altText:pin.altText, sha256:approvedPin.sha256 });
  delete identity.localPath;
  pin.filename = approvedPin.filename;
}

await writeFile("config/pin-batch-026-045.json", `${JSON.stringify(batch, null, 2)}\n`);
await writeFile("config/pin-images.json", `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile("config/pin-image-history.json", `${JSON.stringify(history, null, 2)}\n`);
console.log("Registered 20 approved Drive images without modifying prior immutable routes.");
