import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinFilename, type CanonicalPinIdentity } from "./experiment.js";

export type PinImageManifestEntry = Partial<Pick<CanonicalPinIdentity, "pinId" | "sourceConceptId" | "canonicalTitle" | "sourceFilename" | "altText">> & {
  campaign: string;
  filename: string;
  driveFileId?: string;
  sourceUrl?: string;
  sha256?: string;
  firstSeenCommit?: string;
};

export type PinImageManifest = {
  schemaVersion: 1 | 2;
  images: PinImageManifestEntry[];
};

export type PinImageHistory = { schemaVersion: 1; routes: PinImageManifestEntry[] };

export type PinImageResult = {
  bytes: Buffer;
  contentType: string;
  etag: string;
};

export class PinImageUpstreamError extends Error {
  constructor() {
    super("Configured Pin image is unavailable.");
  }
}

const defaultManifestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "config", "pin-image-history.json");
const allowedContentTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxImageBytes = 25 * 1024 * 1024;
const maxRedirects = 5;

function validCampaign(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function validFilename(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp|gif)$/i.test(value) && !value.includes("..");
}

function driveFileIdFromUrl(value: URL): string | undefined {
  if (value.hostname === "drive.google.com") {
    const fileMatch = value.pathname.match(/^\/file\/d\/([^/]+)/);
    if (fileMatch) return fileMatch[1];
    if (value.pathname === "/uc") return value.searchParams.get("id") ?? undefined;
  }
  if (value.hostname === "drive.usercontent.google.com") return value.searchParams.get("id") ?? undefined;
  return undefined;
}

function validDriveFileId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,}$/.test(value);
}

function sourceFor(entry: PinImageManifestEntry): URL {
  let fileId = entry.driveFileId?.trim();
  if (entry.sourceUrl) {
    let source: URL;
    try {
      source = new URL(entry.sourceUrl);
    } catch {
      throw new Error(`Invalid sourceUrl for ${entry.campaign}/${entry.filename}.`);
    }
    if (source.protocol !== "https:") throw new Error(`Pin image sourceUrl must use HTTPS for ${entry.campaign}/${entry.filename}.`);
    const parsedId = driveFileIdFromUrl(source);
    if (!parsedId) throw new Error(`Pin image sourceUrl must be a supported Google Drive URL for ${entry.campaign}/${entry.filename}.`);
    if (fileId && fileId !== parsedId) throw new Error(`Conflicting Drive file IDs for ${entry.campaign}/${entry.filename}.`);
    fileId = parsedId;
  }
  if (!fileId || !validDriveFileId(fileId)) throw new Error(`A valid Drive file ID is required for ${entry.campaign}/${entry.filename}.`);
  return new URL(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`);
}

function allowedRedirectHost(hostname: string): boolean {
  return hostname === "drive.google.com" || hostname === "drive.usercontent.google.com" || hostname === "googleusercontent.com" || hostname.endsWith(".googleusercontent.com");
}

export function validatePinImageManifest(input: unknown): PinImageManifest {
  if (!input || typeof input !== "object") throw new Error("Pin image manifest must be a JSON object.");
  const manifest = input as Partial<PinImageManifest>;
  if ((manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) || !Array.isArray(manifest.images)) throw new Error("Unsupported Pin image manifest schema.");
  const seen = new Set<string>();
  const seenPinIds = new Set<string>();
  for (const entry of manifest.images) {
    if (!entry || typeof entry !== "object" || !validCampaign(entry.campaign) || !validFilename(entry.filename)) throw new Error("Pin image manifest contains an invalid campaign or filename.");
    const key = `${entry.campaign}/${entry.filename}`;
    if (seen.has(key)) throw new Error(`Duplicate Pin image manifest entry: ${key}.`);
    seen.add(key);
    if (entry.pinId !== undefined) {
      if (!/^pin_\d{3}$/.test(entry.pinId) || entry.pinId === "pin_000") throw new Error(`Invalid Pin ID in image manifest: ${entry.pinId}.`);
      if (seenPinIds.has(entry.pinId)) throw new Error(`Duplicate Pin image manifest Pin ID: ${entry.pinId}.`);
      seenPinIds.add(entry.pinId);
    }
    if (entry.sourceFilename !== undefined && (!entry.sourceFilename.trim() || /[\\/]/.test(entry.sourceFilename))) throw new Error(`Invalid source filename for ${key}.`);
    if (entry.sourceConceptId !== undefined && (!Number.isInteger(entry.sourceConceptId) || entry.sourceConceptId < 1)) throw new Error(`Invalid source concept ID for ${key}.`);
    if (entry.canonicalTitle !== undefined && (!entry.canonicalTitle.trim() || entry.canonicalTitle.length > 100)) throw new Error(`Invalid canonical title for ${key}.`);
    if (entry.altText !== undefined && (!entry.altText.trim() || entry.altText.length > 500)) throw new Error(`Invalid ALT text for ${key}.`);
    if (entry.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Invalid SHA-256 for ${key}.`);
    sourceFor(entry);
  }
  return manifest as PinImageManifest;
}

export function validatePinImageHistory(input: unknown): PinImageManifest {
  if (!input || typeof input !== "object") throw new Error("Pin image history must be a JSON object.");
  const history = input as Partial<PinImageHistory>;
  if (history.schemaVersion !== 1 || !Array.isArray(history.routes)) throw new Error("Unsupported Pin image history schema.");
  const manifest = validatePinImageManifest({ schemaVersion: 1, images: history.routes });
  for (const entry of manifest.images) {
    if (!entry.sha256 || !entry.firstSeenCommit) throw new Error(`Immutable history entry is incomplete for ${entry.campaign}/${entry.filename}.`);
  }
  return manifest;
}

export function validateCanonicalImageHistory(canonical: PinImageManifest, history: PinImageManifest): void {
  const locked = new Map(history.images.map((entry) => [`${entry.campaign}/${entry.filename}`, entry]));
  for (const entry of canonical.images) {
    const historical = locked.get(`${entry.campaign}/${entry.filename}`);
    if (!historical) throw new Error(`Canonical image route is missing from immutable history: ${entry.campaign}/${entry.filename}.`);
    if (!entry.driveFileId || !entry.sha256 || historical.driveFileId !== entry.driveFileId || historical.sha256 !== entry.sha256) throw new Error(`Immutable image identity changed for ${entry.campaign}/${entry.filename}; use a new versioned filename.`);
  }
}

export function canonicalPinIdentities(manifest: PinImageManifest, campaign: string): CanonicalPinIdentity[] {
  const entries = manifest.images.filter((entry) => entry.campaign === campaign);
  const identities = entries.map((entry) => {
    if (!entry.pinId || !entry.sourceConceptId || !entry.canonicalTitle || !entry.sourceFilename || !entry.driveFileId || !entry.altText || !entry.sha256) {
      throw new Error(`Canonical Pin identity is incomplete for ${entry.pinId ?? `${campaign}/${entry.filename}`}.`);
    }
    return {
      pinId: entry.pinId,
      sourceConceptId: entry.sourceConceptId,
      canonicalTitle: entry.canonicalTitle,
      campaign: entry.campaign,
      filename: entry.filename,
      sourceFilename: entry.sourceFilename,
      driveFileId: entry.driveFileId,
      altText: entry.altText,
      sha256: entry.sha256!,
    };
  }).sort((a, b) => a.pinId.localeCompare(b.pinId));
  const expected = Array.from({ length: 24 }, (_, index) => `pin_${String(index + 2).padStart(3, "0")}`);
  if (identities.length > 0 && identities.map((identity) => identity.pinId).join(",") !== expected.join(",")) throw new Error("The Philippines canonical Pin catalog must contain each Pin ID from pin_002 through pin_025 exactly once.");
  for (const identity of identities) {
    const baseFilename = pinFilename({ id: Number(identity.pinId.slice(4)), title: identity.canonicalTitle });
    const expectedFilename = Number(identity.pinId.slice(4)) >= 6 ? baseFilename.replace(/\.png$/, "-v2.png") : baseFilename;
    if (identity.filename !== expectedFilename) throw new Error(`${identity.pinId} public filename must be the deterministic filename for its canonical title: ${expectedFilename}.`);
  }
  return identities;
}

export async function loadPinImageManifest(manifestPath = process.env.PIN_IMAGE_MANIFEST_PATH?.trim() || defaultManifestPath): Promise<PinImageManifest> {
  const input = JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
  return "routes" in input ? validatePinImageHistory(input) : validatePinImageManifest(input);
}

export class PinImageService {
  private readonly entries: Map<string, PinImageManifestEntry>;
  private readonly cache = new Map<string, PinImageResult>();

  constructor(manifest: PinImageManifest, private readonly fetchImpl: typeof fetch = fetch) {
    const validated = validatePinImageManifest(manifest);
    this.entries = new Map(validated.images.map((entry) => [`${entry.campaign}/${entry.filename}`, entry]));
  }

  has(campaign: string, filename: string): boolean {
    return this.entries.has(`${campaign}/${filename}`);
  }

  async get(campaign: string, filename: string): Promise<PinImageResult | undefined> {
    const key = `${campaign}/${filename}`;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    const cached = this.cache.get(key);
    if (cached) return cached;
    try {
      let url = sourceFor(entry);
      let upstream: Response | undefined;
      for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
        upstream = await this.fetchImpl(url, { redirect: "manual", headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" }, signal: AbortSignal.timeout(10_000) });
        if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
        const location = upstream.headers.get("location");
        if (!location || redirect === maxRedirects) throw new PinImageUpstreamError();
        const next = new URL(location, url);
        if (next.protocol !== "https:" || !allowedRedirectHost(next.hostname)) throw new PinImageUpstreamError();
        url = next;
      }
      if (!upstream?.ok) throw new PinImageUpstreamError();
      const contentType = upstream.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      if (!allowedContentTypes.has(contentType)) throw new PinImageUpstreamError();
      const declaredLength = Number(upstream.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxImageBytes) throw new PinImageUpstreamError();
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.length === 0 || bytes.length > maxImageBytes) throw new PinImageUpstreamError();
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (entry.sha256 && digest !== entry.sha256) throw new PinImageUpstreamError();
      const etag = `"${digest}"`;
      const result = { bytes, contentType, etag };
      this.cache.set(key, result);
      return result;
    } catch (error) {
      if (error instanceof PinImageUpstreamError) throw error;
      throw new PinImageUpstreamError();
    }
  }
}

export async function createDefaultPinImageService(): Promise<PinImageService> {
  return new PinImageService(await loadPinImageManifest());
}
