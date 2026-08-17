import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultPinImageService, PinImageService, PinImageUpstreamError } from "./pin-image-proxy.js";

const productionOrigin = "https://travel.stampdup.com";
const brandName = "StampdUp Travel";
const tagline = "The Journey Is the Stamp.";
const assetDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets");
const trackedKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

const assets = new Map([
  ["/assets/PinLogo.png", { file: "PinLogo.png", cache: "public, max-age=86400" }],
  ["/assets/StampdUpTravelLogo.png", { file: "StampdUpTravelLogo.png", cache: "public, max-age=86400" }],
]);

const checklistGroups = [
  {
    title: "Before you fly",
    items: [
      "Verify current official entry requirements for your nationality and itinerary.",
      "Check passport validity and keep booking and accommodation details together.",
      "Share your itinerary with a trusted contact and review travel insurance coverage.",
      "Save airline, accommodation, and onward-travel confirmations offline.",
    ],
  },
  {
    title: "Documents and offline backups",
    items: [
      "Save offline copies of your passport identity page and important confirmations.",
      "Write down your first accommodation address and contact details.",
      "Store key files in more than one secure location you can access while traveling.",
      "Download offline maps for your arrival area and pin your accommodation.",
    ],
  },
  {
    title: "Phone and eSIM preparation",
    items: [
      "Confirm your phone supports eSIM and is carrier-unlocked before choosing a plan.",
      "Follow your provider’s instructions for installation and activation timing.",
      "Know which line will handle mobile data and whether data roaming is required.",
      "Check hotspot support and save setup instructions and support details offline.",
    ],
  },
  {
    title: "Money and airport transfer",
    items: [
      "Carry more than one usable payment method and keep the backup separate.",
      "Review your bank’s travel settings and card controls before departure.",
      "Plan where you will obtain cash and avoid relying on a single ATM or card.",
      "Save your airport pickup point, transfer plan, and hotel address offline.",
    ],
  },
  {
    title: "First 72 hours",
    items: [
      "Confirm your connection, accommodation check-in, and next-day essentials first.",
      "Install and sign in to the app categories you expect to use.",
      "Test your work connection and backup before an important remote meeting.",
      "Pause before adding a full itinerary; leave time to rest and get oriented.",
    ],
  },
];

const baseStyles = `
  :root {
    color-scheme: light;
    --forest: #064c36;
    --forest-dark: #023b2a;
    --gold: #f5b82e;
    --cream: #fff9ed;
    --paper: #ffffff;
    --ink: #17352d;
    --muted: #5f716b;
    --line: #e8ddc8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--cream); color: var(--ink); line-height: 1.6; }
  img { display: block; max-width: 100%; }
  a { color: var(--forest); }
  a:focus-visible, button:focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }
  .site-header { background: rgba(255,249,237,.96); border-bottom: 1px solid var(--line); }
  .nav { width: min(1120px, calc(100% - 32px)); min-height: 76px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .wordmark { width: 220px; height: auto; }
  .tagline { margin: 0; color: var(--forest); font-size: .86rem; font-weight: 750; letter-spacing: .02em; }
  main { overflow: hidden; }
  .wrap { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
  .hero { padding: clamp(64px, 10vw, 124px) 0 72px; background: radial-gradient(circle at 90% 10%, rgba(245,184,46,.26), transparent 36%), var(--cream); }
  .hero-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(260px, .65fr); align-items: center; gap: 56px; }
  .eyebrow { margin: 0 0 12px; color: var(--forest); font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
  h1 { max-width: 790px; margin: 0; color: var(--forest-dark); font-size: clamp(2.8rem, 8vw, 5.7rem); line-height: .96; letter-spacing: -.055em; }
  .lead { max-width: 720px; margin: 24px 0 0; color: #38544b; font-size: clamp(1.1rem, 2.2vw, 1.35rem); }
  .hero-mark { width: min(330px, 76vw); margin: 0 auto; border-radius: 34px; box-shadow: 0 24px 70px rgba(6,76,54,.18); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 30px; }
  .button { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; padding: 12px 20px; border: 2px solid var(--forest); border-radius: 999px; background: var(--forest); color: white; font: inherit; font-weight: 800; text-decoration: none; cursor: pointer; }
  .button:hover { background: var(--forest-dark); }
  .button.secondary { background: transparent; color: var(--forest); }
  .button[disabled] { border-color: #a9b4af; background: #e3e8e5; color: #66736e; cursor: not-allowed; }
  .trust-note { margin: 16px 0 0; color: var(--muted); font-size: .92rem; }
  .section { padding: 80px 0; }
  .section.alt { background: var(--paper); }
  .section.gold { background: var(--gold); color: var(--forest-dark); }
  .section-heading { max-width: 760px; margin-bottom: 34px; }
  .section-heading h2 { margin: 0; color: var(--forest-dark); font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.05; letter-spacing: -.035em; }
  .section-heading p { margin: 14px 0 0; color: var(--muted); font-size: 1.05rem; }
  .gold .section-heading p { color: #304c43; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
  .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .card { padding: 26px; border: 1px solid var(--line); border-radius: 22px; background: var(--paper); box-shadow: 0 10px 30px rgba(2,59,42,.05); }
  .card h3 { margin: 0 0 10px; color: var(--forest); font-size: 1.15rem; }
  .card p { margin: 0; color: var(--muted); }
  .card ul, .content-list { margin: 12px 0 0; padding-left: 20px; }
  .card li, .content-list li { margin: 8px 0; }
  .step { display: grid; grid-template-columns: 42px 1fr; gap: 14px; align-items: start; }
  .step-number { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 50%; background: var(--gold); color: var(--forest-dark); font-weight: 900; }
  .callout { padding: 30px; border-left: 6px solid var(--gold); border-radius: 18px; background: #f2f7f4; }
  .callout h2, .callout h3 { margin-top: 0; color: var(--forest); }
  .affiliate-box { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; padding: 32px; border: 2px solid var(--forest); border-radius: 24px; background: var(--paper); }
  .affiliate-recommendation { display: block; margin-top: 28px; }
  .affiliate-box h2 { margin: 0; color: var(--forest); }
  .affiliate-box p { margin: 8px 0 0; color: var(--muted); }
  .disclosure { margin-top: 18px; font-size: .9rem; color: var(--muted); }
  .setup-guide { margin-top: 34px; padding: clamp(24px, 5vw, 40px); border-radius: 24px; background: #f2f7f4; }
  .setup-guide h2 { margin: 0; color: var(--forest-dark); font-size: clamp(1.7rem, 4vw, 2.45rem); line-height: 1.1; }
  .setup-list { margin: 24px 0 0; padding-left: 28px; }
  .setup-list li { margin: 16px 0; padding-left: 8px; }
  .setup-note { margin: 22px 0 0; padding-top: 20px; border-top: 1px solid #cad9d1; color: #38544b; }
  .checklist { display: grid; gap: 24px; }
  .check-group { break-inside: avoid; padding: 26px; border: 1px solid var(--line); border-radius: 20px; background: var(--paper); }
  .check-group h2 { margin: 0 0 15px; color: var(--forest); font-size: 1.35rem; }
  .check-row { display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: start; margin: 12px 0; }
  .check-row input { width: 18px; height: 18px; margin-top: 4px; accent-color: var(--forest); }
  .site-footer { padding: 38px 0; background: var(--forest-dark); color: white; }
  .footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .footer-mark { width: 54px; height: 54px; border-radius: 12px; }
  .site-footer p { margin: 0; }
  .small { font-size: .9rem; }
  @media (max-width: 800px) {
    .hero-grid, .affiliate-box { grid-template-columns: 1fr; }
    .hero-mark { width: min(240px, 62vw); }
    .grid, .grid.two { grid-template-columns: 1fr; }
    .tagline { display: none; }
    .wordmark { width: 190px; }
    .section { padding: 62px 0; }
    .footer-inner { align-items: flex-start; flex-direction: column; }
  }
  @media print {
    .site-header, .site-footer, .no-print, .hero-mark { display: none !important; }
    body, .hero, .section, .section.alt { background: white !important; }
    .hero { padding: 20px 0 30px; }
    h1 { font-size: 32pt; }
    .section { padding: 20px 0; }
    .checklist { grid-template-columns: 1fr 1fr; }
    .check-group { box-shadow: none; }
  }
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
}

function trackingParams(url: URL): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of trackedKeys) {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value.slice(0, 160));
  }
  return params;
}

function trackedHref(targetPath: string, url: URL): string {
  const query = trackingParams(url).toString();
  return escapeHtml(query ? `${targetPath}?${query}` : targetPath);
}

function logEvent(event: string, url: URL): void {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    path: url.pathname,
    utm: Object.fromEntries(trackingParams(url)),
  }));
}

function affiliateDestination(): URL | undefined {
  const configured = process.env.AFFILIATE_ESIM_URL?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" || url.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function header(): string {
  return `<header class="site-header">
    <nav class="nav" aria-label="Primary navigation">
      <a href="/" aria-label="StampdUp Travel home"><img class="wordmark" src="/assets/StampdUpTravelLogo.png" width="220" height="110" alt="StampdUp Travel palm tree, airplane, and ocean wordmark"></a>
      <p class="tagline">${tagline}</p>
    </nav>
  </header>`;
}

function footer(): string {
  return `<footer class="site-footer"><div class="wrap footer-inner">
    <img class="footer-mark" src="/assets/PinLogo.png" width="54" height="54" alt="StampdUp Travel compact palm tree and airplane logo">
    <div><p><strong>${brandName}</strong> · ${tagline}</p><p class="small">Practical preparation for more confident arrivals.</p></div>
  </div></footer>`;
}

type PageMetadata = { title: string; description: string; canonicalPath: string; body: string };

function page({ title, description, canonicalPath, body }: PageMetadata): string {
  const canonical = `${productionOrigin}${canonicalPath}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/png" href="/assets/PinLogo.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${brandName}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${productionOrigin}/assets/StampdUpTravelLogo.png">
  <meta property="og:image:alt" content="StampdUp Travel palm tree, airplane, and ocean wordmark">
  <meta name="twitter:card" content="summary_large_image">
  <style>${baseStyles}</style>
</head>
<body>${header()}<main>${body}</main>${footer()}</body>
</html>`;
}

function homePage(url: URL): string {
  const kitHref = trackedHref("/philippines-arrival-kit", url);
  return page({
    title: "StampdUp Travel | Practical arrival guides",
    description: "Practical destination arrival guides and travel tools from StampdUp Travel.",
    canonicalPath: "/",
    body: `<section class="hero"><div class="wrap hero-grid"><div>
      <p class="eyebrow">${tagline}</p>
      <h1>Arrive prepared. Start with confidence.</h1>
      <p class="lead">Calm, practical destination tools for the details between booking the flight and settling into your first days.</p>
      <div class="actions"><a class="button" href="${kitHref}">Explore the Philippines Arrival Kit</a></div>
    </div><img class="hero-mark" src="/assets/PinLogo.png" width="330" height="330" alt="StampdUp Travel compact logo with a palm tree, airplane, sun, and ocean"></div></section>
    <section class="section alt"><div class="wrap"><div class="section-heading"><h2>Useful before you need it</h2><p>Destination-specific preparation without pressure, exaggerated promises, or one-size-fits-all assumptions.</p></div><div class="grid">
      <article class="card"><h3>Prepare offline</h3><p>Keep critical documents, addresses, routes, and setup instructions available after landing.</p></article>
      <article class="card"><h3>Plan the handoffs</h3><p>Think through connectivity, payment backups, airport pickup, and hotel check-in in advance.</p></article>
      <article class="card"><h3>Settle in calmly</h3><p>Use a manageable first-72-hours plan instead of trying to solve the whole trip at once.</p></article>
    </div></div></section>`,
  });
}

function affiliateArea(url: URL): string | undefined {
  if (!affiliateDestination()) return undefined;
  return `<aside class="affiliate-recommendation" aria-label="eSIM recommendation"><div class="affiliate-box"><div><h2>eSIM recommendation</h2><p>Review the plan details, device requirements, and activation instructions before deciding whether it fits your trip.</p></div><a class="button" href="${trackedHref("/go/esim", url)}" rel="nofollow sponsored">View the eSIM recommendation</a></div>
  <p class="disclosure"><strong>Affiliate disclosure:</strong> StampdUp Travel may earn a commission from qualifying purchases at no additional cost to the traveler.</p></aside>`;
}

function arrivalKitPage(url: URL): string {
  const checklistHref = trackedHref("/philippines-arrival-checklist", url);
  const downloadHref = trackedHref("/philippines-arrival-checklist.txt", url);
  const recommendation = affiliateArea(url);
  logEvent("arrival_kit_visit", url);
  return page({
    title: "Philippines Arrival Kit | First 72 Hours | StampdUp Travel",
    description: "A practical Philippines arrival guide covering documents, eSIM preparation, airport order, money backups, transport, apps, and your first 72 hours.",
    canonicalPath: "/philippines-arrival-kit",
    body: `<section class="hero"><div class="wrap hero-grid"><div>
      <p class="eyebrow">Philippines travel planning</p>
      <h1>Philippines Arrival Kit</h1>
      <p class="lead">A practical first-72-hours travel kit for first-time Philippines travelers and digital nomads.</p>
      <div class="actions no-print"><a class="button" href="${checklistHref}">Open the free arrival checklist</a><a class="button secondary" href="${downloadHref}" download>Download text checklist</a></div>
      <p class="trust-note">No account or email required. Verify current official entry requirements separately before travel.</p>
    </div><img class="hero-mark" src="/assets/PinLogo.png" width="330" height="330" alt="StampdUp Travel compact logo with a palm tree, airplane, sun, and ocean"></div></section>

    <section class="section alt"><div class="wrap"><div class="section-heading"><h2>Before you fly</h2><p>Make essential information available offline and check the details that vary by traveler and itinerary.</p></div><div class="grid two">
      <article class="card"><h3>Preparation</h3><ul><li>Verify current official entry requirements for your nationality and route.</li><li>Review passport validity, bookings, insurance coverage, and onward plans.</li><li>Share your itinerary with a trusted contact.</li></ul></article>
      <article class="card"><h3>Documents and offline backups</h3><ul><li>Save your accommodation address and contact details.</li><li>Keep secure offline copies of key documents and confirmations.</li><li>Download arrival-area maps and save the first route.</li></ul></article>
    </div></div></section>

    <section class="section"><div class="wrap"><div class="section-heading"><h2>Phone and eSIM preparation</h2><p>Plan behavior varies. Always follow the instructions supplied by your provider and confirm the details for your own device.</p></div><div class="grid">
      <article class="card"><h3>Compatibility</h3><p>Confirm the phone supports eSIM and is carrier-unlocked before selecting or installing a plan.</p></article>
      <article class="card"><h3>Installation and activation</h3><p>Check when installation is allowed, what triggers the plan period, and whether activation should wait until arrival.</p></article>
      <article class="card"><h3>Data settings</h3><p>Know how to select the travel data line, whether roaming is required, and how the primary line should behave.</p></article>
      <article class="card"><h3>Hotspot support</h3><p>Check the plan terms and device settings before treating tethering as a remote-work backup.</p></article>
      <article class="card"><h3>Offline instructions</h3><p>Save the installation steps, QR details, support channel, and troubleshooting notes somewhere available offline.</p></article>
      <article class="card"><h3>Test deliberately</h3><p>Confirm the intended data line after arrival and avoid deleting an installed eSIM while troubleshooting.</p></article>
    </div>
    <div class="setup-guide"><h2>Philippines eSIM setup: the 5-minute version</h2><ol class="setup-list">
      <li><strong>Check compatibility</strong> — Confirm that the phone supports eSIM and is carrier-unlocked.</li>
      <li><strong>Choose the plan carefully</strong> — Review coverage, data allowance, validity period, hotspot support, activation rules, and support options.</li>
      <li><strong>Install on reliable Wi-Fi</strong> — Follow the provider’s instructions and save the QR code, installation details, and support information offline.</li>
      <li><strong>Preserve the primary SIM</strong> — Do not delete or disable the primary line unnecessarily; decide which line should handle calls, messages, and mobile data.</li>
      <li><strong>Activate at the correct time</strong> — Some plans begin when installed, while others begin when connected at the destination. Follow the provider’s stated activation rule.</li>
      <li><strong>Select the travel data line</strong> — After arrival, choose the eSIM for mobile data and enable data roaming only if the provider instructs it.</li>
      <li><strong>Test before troubleshooting</strong> — Turn off Wi-Fi, test mobile data, and confirm the intended line is active. Do not delete the installed eSIM while troubleshooting.</li>
    </ol><p class="setup-note"><strong>Exact screens, terminology, roaming requirements, and activation behavior vary by device and provider. Always follow the instructions supplied with the selected plan.</strong></p></div>
    ${recommendation ?? ""}</div></section>

    <section class="section alt"><div class="wrap"><div class="section-heading"><h2>Airport arrival order</h2><p>Exact procedures differ by terminal and itinerary. Use this as an organizing sequence, then follow signs and official instructions.</p></div><div class="grid two">
      <article class="card step"><div class="step-number">1</div><div><h3>Entry process</h3><p>Keep travel documents and accommodation details accessible and follow the current official arrival process.</p></div></article>
      <article class="card step"><div class="step-number">2</div><div><h3>Baggage</h3><p>Collect and check your luggage before shifting attention to connectivity or transportation.</p></div></article>
      <article class="card step"><div class="step-number">3</div><div><h3>Connection and money</h3><p>Bring your phone online, retrieve offline details, and obtain only the cash you are comfortable carrying.</p></div></article>
      <article class="card step"><div class="step-number">4</div><div><h3>Onward transport</h3><p>Confirm the pickup point, driver or official transport option, destination, and payment method.</p></div></article>
    </div></div></section>

    <section class="section"><div class="wrap"><div class="section-heading"><h2>Cash, cards, ATMs, and payment backup</h2><p>Availability, limits, fees, and acceptance vary. Build redundancy instead of depending on one card, one ATM, or one payment app.</p></div><div class="grid">
      <article class="card"><h3>Before departure</h3><p>Review bank travel settings, card controls, support contacts, and how you would respond to a blocked or lost card.</p></article>
      <article class="card"><h3>On arrival</h3><p>Use official, well-maintained facilities you are comfortable with and review the on-screen terms before continuing.</p></article>
      <article class="card"><h3>Keep a backup</h3><p>Carry a separate payment option and some practical cash without keeping every resource in the same place.</p></article>
    </div></div></section>

    <section class="section alt"><div class="wrap"><div class="section-heading"><h2>Airport to hotel</h2><p>Reduce arrival friction by deciding how you will identify the correct pickup area and confirm your destination.</p></div><div class="grid two">
      <article class="card"><h3>Save the route</h3><ul><li>Hotel name, full address, contact number, and check-in details</li><li>Offline map and a screenshot of the expected route</li><li>Pickup instructions or official transport information for your terminal</li></ul></article>
      <article class="card"><h3>Confirm before moving</h3><ul><li>Check the vehicle or operator details where applicable</li><li>Confirm the destination and payment method</li><li>Message the accommodation if plans materially change</li></ul></article>
    </div></div></section>

    <section class="section"><div class="wrap"><div class="section-heading"><h2>Useful app categories</h2><p>Install, update, and sign in before travel. Specific availability and features can vary by location and account.</p></div><div class="grid">
      <article class="card"><h3>Navigation</h3><p>Online directions plus offline maps and saved places.</p></article>
      <article class="card"><h3>Transportation</h3><p>Ride or transit tools relevant to your arrival city and terminal.</p></article>
      <article class="card"><h3>Communication</h3><p>Messaging, translation, and access to accommodation contacts.</p></article>
      <article class="card"><h3>Weather</h3><p>Current conditions to support day-to-day planning.</p></article>
      <article class="card"><h3>Bookings</h3><p>Airline, accommodation, and itinerary confirmations in one place.</p></article>
      <article class="card"><h3>Financial controls</h3><p>Your bank’s official tools for alerts, controls, and support access.</p></article>
    </div></div></section>

    <section class="section gold"><div class="wrap"><div class="section-heading"><h2>Your first 24 hours</h2><p>Keep day one intentionally light. The objective is to get settled, connected, and oriented.</p></div><div class="grid">
      <article class="card"><h3>Connect</h3><p>Confirm mobile data, messaging, maps, and access to your offline backups.</p></article>
      <article class="card"><h3>Settle</h3><p>Complete check-in, secure important items, charge devices, and rest.</p></article>
      <article class="card"><h3>Orient</h3><p>Locate practical nearby essentials and confirm tomorrow’s first commitment.</p></article>
    </div></div></section>

    <section class="section alt"><div class="wrap"><div class="section-heading"><h2>Your first 72 hours</h2><p>Add complexity gradually after the arrival basics are working.</p></div><div class="grid">
      <article class="card"><h3>Day 1 · Arrive</h3><p>Transfer, check in, connect, eat, charge devices, and rest.</p></article>
      <article class="card"><h3>Day 2 · Stabilize</h3><p>Test payments, review routes, confirm bookings, and learn your immediate area.</p></article>
      <article class="card"><h3>Day 3 · Expand</h3><p>Refine connectivity, plan onward travel, and add work or exploration with realistic buffers.</p></article>
    </div></div></section>

    <section class="section"><div class="wrap"><div class="section-heading"><h2>Digital-nomad connectivity backup</h2><p>A backup is useful only if it has been checked before an important call or deadline.</p></div><div class="grid two">
      <article class="card"><h3>Connection stack</h3><ul><li>Primary accommodation or workspace Wi-Fi</li><li>Mobile-data backup with confirmed hotspot support</li><li>Offline copies of critical work and meeting details</li></ul></article>
      <article class="card"><h3>Power and workspace</h3><ul><li>Charged power bank and compatible charging setup</li><li>A second suitable work location where practical</li><li>A plan for rescheduling if conditions do not support a reliable call</li></ul></article>
    </div></div></section>

    <section class="section alt"><div class="wrap"><div class="section-heading"><h2>Common arrival mistakes</h2><p>Most are simple handoff problems that can be reduced before departure.</p></div><div class="grid">
      <article class="card"><h3>Keeping everything online</h3><p>Save addresses, instructions, confirmations, and essential contacts offline.</p></article>
      <article class="card"><h3>Depending on one payment method</h3><p>Bring a separate backup and know how to contact your provider.</p></article>
      <article class="card"><h3>Assuming eSIM timing</h3><p>Plan validity and activation behavior vary; follow the provider’s instructions.</p></article>
      <article class="card"><h3>Skipping the pickup plan</h3><p>Know the terminal, meeting point, destination, and expected payment method.</p></article>
      <article class="card"><h3>Scheduling too much</h3><p>Leave room for arrival procedures, traffic, check-in, food, and rest.</p></article>
      <article class="card"><h3>Not testing work backup</h3><p>Check hotspot, power, and alternate workspace options before they are urgent.</p></article>
    </div></div></section>

    <section class="section" id="checklist"><div class="wrap"><div class="callout"><h2>Take the checklist with you</h2><p>Open the interactive checklist, print it, or download a plain-text copy. No signup required.</p><div class="actions no-print"><a class="button" href="${checklistHref}">Open printable checklist</a><a class="button secondary" href="${downloadHref}" download>Download checklist</a></div></div></div></section>`,
  });
}

function checklistPage(url: URL): string {
  logEvent("arrival_checklist_open", url);
  const downloadHref = trackedHref("/philippines-arrival-checklist.txt", url);
  const kitHref = trackedHref("/philippines-arrival-kit", url);
  const printEventHref = trackedHref("/events/print", url);
  const groups = checklistGroups.map((group, groupIndex) => `<section class="check-group"><h2>${escapeHtml(group.title)}</h2>${group.items.map((item, itemIndex) => `<label class="check-row"><input type="checkbox" aria-label="${escapeHtml(item)}"><span>${escapeHtml(item)}</span></label>`).join("")}</section>`).join("");
  return page({
    title: "Free Philippines Arrival Checklist | StampdUp Travel",
    description: "A free printable Philippines arrival checklist for documents, eSIM preparation, money backup, airport transfer, and the first 72 hours.",
    canonicalPath: "/philippines-arrival-checklist",
    body: `<section class="hero"><div class="wrap"><p class="eyebrow">Free · No signup required</p><h1>Philippines Arrival Checklist</h1><p class="lead">A practical checklist for the handoffs between departure, airport arrival, hotel check-in, and your first 72 hours.</p><div class="actions no-print"><button class="button" type="button" onclick="fetch('${printEventHref}', { method: 'POST', keepalive: true }).catch(() => {}); window.print()">Print checklist</button><a class="button secondary" href="${downloadHref}" download>Download text checklist</a><a href="${kitHref}">Back to the full Arrival Kit</a></div><p class="trust-note">Verify current official entry requirements separately. Procedures and provider behavior can change.</p></div></section><section class="section alt"><div class="wrap checklist">${groups}</div></section>`,
  });
}

function checklistText(): string {
  const lines = [brandName, tagline, "", "PHILIPPINES ARRIVAL CHECKLIST", "Verify current official entry requirements separately before travel.", ""];
  for (const group of checklistGroups) {
    lines.push(group.title.toUpperCase());
    for (const item of group.items) lines.push(`[ ] ${item}`);
    lines.push("");
  }
  lines.push("Provider reminder: eSIM plan behavior varies. Follow your provider’s installation, activation, roaming, and hotspot instructions.");
  return lines.join("\n") + "\n";
}

function send(response: ServerResponse, status: number, contentType: string, body: string | Buffer, extraHeaders: Record<string, string> = {}): void {
  response.writeHead(status, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff", ...extraHeaders });
  response.end(body);
}

async function serveAsset(pathname: string, response: ServerResponse): Promise<boolean> {
  const asset = assets.get(pathname);
  if (!asset) return false;
  try {
    const data = await readFile(path.join(assetDirectory, asset.file));
    send(response, 200, "image/png", data, { "Cache-Control": asset.cache });
  } catch {
    send(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "Not found" }));
  }
  return true;
}

function pinImagePath(pathname: string, diagnostic = false): { campaign: string; filename: string } | undefined {
  const prefix = diagnostic ? "/health/pins/" : "/pins/";
  if (!pathname.startsWith(prefix)) return undefined;
  const parts = pathname.slice(prefix.length).split("/");
  if (parts.length !== 2 || parts.some((part) => !part)) return undefined;
  try {
    return { campaign: decodeURIComponent(parts[0]), filename: decodeURIComponent(parts[1]) };
  } catch {
    return undefined;
  }
}

async function servePinImage(request: IncomingMessage, response: ServerResponse, pinImages: PinImageService, campaign: string, filename: string, diagnostic: boolean): Promise<void> {
  if (!pinImages.has(campaign, filename)) {
    send(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "Not found" }), { "Cache-Control": "no-store" });
    return;
  }
  try {
    const image = await pinImages.get(campaign, filename);
    if (!image) {
      send(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "Not found" }), { "Cache-Control": "no-store" });
      return;
    }
    if (diagnostic) {
      send(response, 200, "application/json; charset=utf-8", JSON.stringify({ status: "ok", campaign, filename, contentType: image.contentType, bytes: image.bytes.length }), { "Cache-Control": "no-store" });
      return;
    }
    const cacheHeaders = { "Cache-Control": "public, max-age=31536000, immutable", ETag: image.etag };
    if (request.headers["if-none-match"] === image.etag) {
      response.writeHead(304, { ...cacheHeaders, "X-Content-Type-Options": "nosniff" });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": image.contentType, "Content-Length": String(image.bytes.length), "X-Content-Type-Options": "nosniff", ...cacheHeaders });
    response.end(request.method === "HEAD" ? undefined : image.bytes);
  } catch (error) {
    if (!(error instanceof PinImageUpstreamError)) console.error("Unexpected Pin image route failure.");
    send(response, 502, "application/json; charset=utf-8", JSON.stringify({ error: "Pin image unavailable" }), { "Cache-Control": "no-store" });
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, pinImagesPromise: Promise<PinImageService>): Promise<void> {
  const url = new URL(request.url ?? "/", productionOrigin);
  if (request.method === "POST" && url.pathname === "/events/print") {
    logEvent("arrival_checklist_print", url);
    response.writeHead(204, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end();
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, "application/json; charset=utf-8", JSON.stringify({ error: "Method not allowed" }), { Allow: "GET, HEAD" });
    return;
  }

  if (await serveAsset(url.pathname, response)) return;
  const imagePath = pinImagePath(url.pathname);
  if (imagePath) {
    await servePinImage(request, response, await pinImagesPromise, imagePath.campaign, imagePath.filename, false);
    return;
  }
  const diagnosticPath = pinImagePath(url.pathname, true);
  if (diagnosticPath) {
    await servePinImage(request, response, await pinImagesPromise, diagnosticPath.campaign, diagnosticPath.filename, true);
    return;
  }
  if (url.pathname === "/health") {
    send(response, 200, "application/json; charset=utf-8", JSON.stringify({ status: "ok" }), { "Cache-Control": "no-store" });
    return;
  }
  if (url.pathname === "/") {
    send(response, 200, "text/html; charset=utf-8", homePage(url));
    return;
  }
  if (url.pathname === "/philippines-arrival-kit") {
    send(response, 200, "text/html; charset=utf-8", arrivalKitPage(url));
    return;
  }
  if (url.pathname === "/philippines-arrival-checklist") {
    send(response, 200, "text/html; charset=utf-8", checklistPage(url));
    return;
  }
  if (url.pathname === "/philippines-arrival-checklist.txt") {
    logEvent("arrival_checklist_download", url);
    send(response, 200, "text/plain; charset=utf-8", checklistText(), { "Content-Disposition": "attachment; filename=stampdup-travel-philippines-arrival-checklist.txt" });
    return;
  }
  if (url.pathname === "/go/esim") {
    const destination = affiliateDestination();
    if (!destination) {
      send(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "Not found" }));
      return;
    }
    for (const [key, value] of trackingParams(url)) destination.searchParams.set(key, value);
    logEvent("esim_recommendation_click", url);
    response.writeHead(302, { Location: destination.toString(), "Cache-Control": "no-store" });
    response.end();
    return;
  }
  send(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "Not found" }));
}

export function createStampdUpServer(options: { pinImages?: PinImageService | Promise<PinImageService> } = {}): Server {
  const pinImagesPromise = Promise.resolve(options.pinImages ?? createDefaultPinImageService());
  return createServer((request, response) => {
    handleRequest(request, response, pinImagesPromise).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      if (!response.headersSent) send(response, 500, "application/json; charset=utf-8", JSON.stringify({ error: "Internal server error" }));
      else response.end();
    });
  });
}
