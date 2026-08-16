import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { createStampdUpServer } from "./site.js";

let server: Server;
let baseUrl: string;

before(async () => {
  server = createStampdUpServer();
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
  assert.match(html, /onclick="window\.print\(\)"/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /philippines-arrival-checklist\.txt\?utm_medium=social/);
  assert.doesNotMatch(html, /coming soon/i);

  const download = await fetch(`${baseUrl}/philippines-arrival-checklist.txt?utm_medium=social`);
  const text = await download.text();
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type") ?? "", /^text\/plain/);
  assert.match(download.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.match(text, /\[ \] Confirm your phone supports eSIM/);
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

test("unknown routes and unconfigured affiliate redirect return 404", async () => {
  const unknown = await fetch(`${baseUrl}/not-a-route`);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: "Not found" });

  const affiliate = await fetch(`${baseUrl}/go/esim`);
  assert.equal(affiliate.status, 404);
  assert.deepEqual(await affiliate.json(), { error: "Not found" });
});
