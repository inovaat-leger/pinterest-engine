import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { createStampdUpServer } from "./site.js";
import { PinImageService, type PinImageManifest } from "./pin-image-proxy.js";

let server: Server;
let baseUrl: string;

before(async () => {
  const manifest: PinImageManifest = { schemaVersion: 1, images: [
    { campaign: "philippines", filename: "valid.png", driveFileId: "pngFixture123" },
    { campaign: "philippines", filename: "valid.jpg", driveFileId: "jpegFixture123" },
    { campaign: "philippines", filename: "not-image.png", driveFileId: "textFixture123" },
    { campaign: "philippines", filename: "unavailable.png", driveFileId: "errorFixture123" },
  ] };
  const upstream: typeof fetch = async (input) => {
    const id = new URL(typeof input === "string" || input instanceof URL ? input : input.url).searchParams.get("id");
    if (id === "pngFixture123") return new Response(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), { status: 200, headers: { "Content-Type": "image/png" } });
    if (id === "jpegFixture123") return new Response(Uint8Array.from([255, 216, 255, 224]), { status: 200, headers: { "Content-Type": "image/jpeg" } });
    if (id === "textFixture123") return new Response("Google Drive preview", { status: 200, headers: { "Content-Type": "text/html" } });
    throw new Error("upstream unavailable");
  };
  server = createStampdUpServer({ pinImages: new PinImageService(manifest, upstream) });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health route returns JSON status", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("analytics endpoint accepts POST before the general method gate", async () => {
  const previousUrl = process.env.STAMPDUP_OS_ANALYTICS_URL;
  delete process.env.STAMPDUP_OS_ANALYTICS_URL;
  try {
    const response = await fetch(`${baseUrl}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status, 503);
  } finally {
    if (previousUrl === undefined) delete process.env.STAMPDUP_OS_ANALYTICS_URL;
    else process.env.STAMPDUP_OS_ANALYTICS_URL = previousUrl;
  }
});

test("homepage uses approved branding and links to the Arrival Kit", async () => {
  const response = await fetch(`${baseUrl}/?utm_source=pinterest&utm_campaign=arrival-kit`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /StampdUpTravelLogo\.png/);
  assert.match(html, /The Journey Is the Stamp\./);
  assert.match(html, /href="\/philippines-arrival-kit\?utm_source=pinterest&amp;utm_campaign=arrival-kit"/);
});

test("Arrival Kit includes metadata, practical sections, and the numbered eSIM setup guide", async () => {
  const previousAffiliateUrl = process.env.AFFILIATE_ESIM_URL;
  delete process.env.AFFILIATE_ESIM_URL;
  try {
    const response = await fetch(`${baseUrl}/philippines-arrival-kit?utm_source=pinterest`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<link rel="canonical" href="https:\/\/travel\.stampdup\.com\/philippines-arrival-kit">/);
    assert.match(html, /<meta property="og:title"/);
    for (const heading of ["Before you fly", "Documents and offline backups", "Phone and eSIM preparation", "Philippines eSIM setup: the 5-minute version", "Airport arrival order", "Cash, cards, ATMs, and payment backup", "Airport to hotel", "Useful app categories", "Your first 24 hours", "Your first 72 hours", "Digital-nomad connectivity backup", "Common arrival mistakes"]) {
      assert.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    for (const step of ["Check compatibility", "Choose the plan carefully", "Install on reliable Wi-Fi", "Preserve the primary SIM", "Activate at the correct time", "Select the travel data line", "Test before troubleshooting"]) {
      assert.match(html, new RegExp(`<strong>${step}<\\/strong>`));
    }
    assert.match(html, /Exact screens, terminology, roaming requirements, and activation behavior vary by device and provider/);
    assert.doesNotMatch(html, /<aside class="affiliate-recommendation"/);
    assert.doesNotMatch(html, /Recommendation not yet configured/);
    assert.doesNotMatch(html, /Affiliate disclosure:/);
    assert.doesNotMatch(html, /disabled aria-disabled="true"/);
    assert.doesNotMatch(html, /coming soon/i);
  } finally {
    if (previousAffiliateUrl === undefined) delete process.env.AFFILIATE_ESIM_URL;
    else process.env.AFFILIATE_ESIM_URL = previousAffiliateUrl;
  }
});

test("configured affiliate URL renders a disclosed CTA and preserves UTM parameters", async () => {
  const previousAffiliateUrl = process.env.AFFILIATE_ESIM_URL;
  process.env.AFFILIATE_ESIM_URL = "https://example.com/approved-esim?ref=stampdup";
  try {
    const response = await fetch(`${baseUrl}/philippines-arrival-kit?utm_source=pinterest&utm_campaign=arrival-kit`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /class="affiliate-recommendation"/);
    assert.match(html, /View the eSIM recommendation/);
    assert.match(html, /Affiliate disclosure:/);
    assert.match(html, /href="\/go\/esim\?utm_source=pinterest&amp;utm_campaign=arrival-kit"/);

    const redirect = await fetch(`${baseUrl}/go/esim?utm_source=pinterest&utm_campaign=arrival-kit`, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "https://example.com/approved-esim?ref=stampdup&utm_source=pinterest&utm_campaign=arrival-kit");
  } finally {
    if (previousAffiliateUrl === undefined) delete process.env.AFFILIATE_ESIM_URL;
    else process.env.AFFILIATE_ESIM_URL = previousAffiliateUrl;
  }
});

test("checklist route is usable, printable, and downloadable", async () => {
  const response = await fetch(`${baseUrl}/philippines-arrival-checklist?utm_medium=social`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Free Philippines Arrival Checklist/);
  assert.match(html, /\/events\/print\?utm_medium=social/);
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /philippines-arrival-checklist\.txt\?utm_medium=social/);
  assert.doesNotMatch(html, /coming soon/i);

  const download = await fetch(`${baseUrl}/philippines-arrival-checklist.txt?utm_medium=social`);
  const text = await download.text();
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type") ?? "", /^text\/plain/);
  assert.match(download.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.match(text, /\[ \] Confirm your phone supports eSIM/);

  const printEvent = await fetch(`${baseUrl}/events/print?utm_medium=social&utm_content=pin_002`, { method: "POST" });
  assert.equal(printEvent.status, 204);
});

test("approved PNG assets are served with the correct content type", async () => {
  for (const asset of ["PinLogo.png", "StampdUpTravelLogo.png"]) {
    const response = await fetch(`${baseUrl}/assets/${asset}`);
    const data = new Uint8Array(await response.arrayBuffer());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual([...data.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test("allowlisted Pin image routes return raw PNG and JPEG bytes with immutable caching", async () => {
  const png = await fetch(`${baseUrl}/pins/philippines/valid.png`);
  assert.equal(png.status, 200);
  assert.equal(png.headers.get("content-type"), "image/png");
  assert.equal(png.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.match(png.headers.get("etag") ?? "", /^"[a-f0-9]{64}"$/);
  assert.deepEqual([...new Uint8Array(await png.arrayBuffer())], [137, 80, 78, 71, 13, 10, 26, 10]);

  const jpeg = await fetch(`${baseUrl}/pins/philippines/valid.jpg`);
  assert.equal(jpeg.status, 200);
  assert.equal(jpeg.headers.get("content-type"), "image/jpeg");
  assert.deepEqual([...new Uint8Array(await jpeg.arrayBuffer())], [255, 216, 255, 224]);

  const notModified = await fetch(`${baseUrl}/pins/philippines/valid.png`, { headers: { "If-None-Match": png.headers.get("etag") ?? "" } });
  assert.equal(notModified.status, 304);
});

test("Pin image route rejects unknown, non-image, and unavailable upstream responses", async () => {
  const unknown = await fetch(`${baseUrl}/pins/philippines/unknown.png`);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: "Not found" });
  assert.equal((await fetch(`${baseUrl}/pins/unknown-campaign/valid.png`)).status, 404);

  for (const filename of ["not-image.png", "unavailable.png"]) {
    const response = await fetch(`${baseUrl}/pins/philippines/${filename}`);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "Pin image unavailable" });
  }
});

test("Pin image diagnostic confirms retrievability without exposing Drive details", async () => {
  const response = await fetch(`${baseUrl}/health/pins/philippines/valid.png`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", campaign: "philippines", filename: "valid.png", contentType: "image/png", bytes: 8 });
  assert.doesNotMatch(await (await fetch(`${baseUrl}/health/pins/philippines/unknown.png`)).text(), /drive|google/i);
});

test("unknown routes and unconfigured affiliate redirect return 404", async () => {
  const unknown = await fetch(`${baseUrl}/not-a-route`);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: "Not found" });

  const affiliate = await fetch(`${baseUrl}/go/esim`);
  assert.equal(affiliate.status, 404);
  assert.deepEqual(await affiliate.json(), { error: "Not found" });
});
