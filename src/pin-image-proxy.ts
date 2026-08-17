import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PinImageManifestEntry = {
  pinId?: string;
  campaign: string;
  filename: string;
  sourceFilename?: string;
  driveFileId?: string;
  sourceUrl?: string;
};

export type PinImageManifest = {
  schemaVersion: 1;
  images: PinImageManifestEntry[];
};

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

const defaultManifestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "config", "pin-images.json");
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
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.images)) throw new Error("Unsupported Pin image manifest schema.");
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
    sourceFor(entry);
  }
  return manifest as PinImageManifest;
}

export async function loadPinImageManifest(manifestPath = process.env.PIN_IMAGE_MANIFEST_PATH?.trim() || defaultManifestPath): Promise<PinImageManifest> {
  return validatePinImageManifest(JSON.parse(await readFile(path.resolve(manifestPath), "utf8")));
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
      const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
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
