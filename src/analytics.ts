import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_BODY_BYTES = 16_384;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const requests = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  const address = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0] ?? request.socket.remoteAddress ?? "unknown";
  return createHash("sha256").update(address.trim()).digest("hex");
}

function limited(request: IncomingMessage): boolean {
  const now = Date.now();
  const key = clientKey(request);
  const current = requests.get(key);
  if (!current || current.resetAt <= now) {
    requests.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS;
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error("body_too_large");
  }
  return body;
}

export async function ingestAnalytics(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    response.writeHead(405, { Allow: "POST" }).end();
    return;
  }
  if (limited(request)) {
    response.writeHead(429, { "Cache-Control": "no-store" }).end();
    return;
  }
  const endpoint = process.env.STAMPDUP_OS_ANALYTICS_URL?.trim();
  const secret = process.env.STAMPDUP_ANALYTICS_INGEST_SECRET?.trim();
  if (!endpoint || !secret) {
    response.writeHead(503, { "Cache-Control": "no-store" }).end();
    return;
  }
  try {
    const body = await readBody(request);
    JSON.parse(body);
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": request.headers["user-agent"] ?? "",
        "x-stampdup-analytics-secret": secret,
        "x-stampdup-request-id": randomUUID(),
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    response.writeHead(upstream.status, { "Cache-Control": "no-store" }).end();
  } catch {
    response.writeHead(400, { "Cache-Control": "no-store" }).end();
  }
}

export const analyticsScript = `<script>
(() => {
  const clean = value => typeof value === "string" ? value.slice(0, 500) : undefined;
  const id = () => crypto.randomUUID();
  let visitorId = localStorage.getItem("stampdup_visitor_id");
  if (!visitorId) { visitorId = id(); localStorage.setItem("stampdup_visitor_id", visitorId); }
  let sessionId = sessionStorage.getItem("stampdup_session_id");
  if (!sessionId) { sessionId = id(); sessionStorage.setItem("stampdup_session_id", sessionId); }
  let attribution;
  try { attribution = JSON.parse(sessionStorage.getItem("stampdup_attribution") || "null"); } catch {}
  if (!attribution) {
    const query = new URLSearchParams(location.search);
    attribution = { landingPage: location.pathname, referrer: document.referrer };
    for (const key of ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"]) {
      const value = query.get(key); if (value) attribution[key] = value.slice(0, 160);
    }
    sessionStorage.setItem("stampdup_attribution", JSON.stringify(attribution));
  }
  const send = (eventType, details = {}) => {
    const payload = { eventId: id(), eventType, sessionId, visitorId, path: location.pathname, title: document.title, ...attribution, ...details };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) navigator.sendBeacon("/events", new Blob([body], { type: "application/json" }));
    else fetch("/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  };
  send("page_view");
  document.addEventListener("click", event => {
    const link = event.target.closest("a[href]"); if (!link) return;
    const url = new URL(link.href, location.href);
    const details = { targetUrl: clean(url.origin === location.origin ? url.pathname : url.origin + url.pathname), label: clean(link.textContent?.trim()) };
    if (link.dataset.analytics === "primary_cta") send("primary_cta_click", details);
    if (link.hasAttribute("download") || url.pathname.endsWith(".txt")) send("checklist_download", details);
    if (url.pathname === "/go/esim") send("affiliate_click", details);
    else if (url.origin !== location.origin) send("outbound_click", details);
  }, { capture: true });
})();
</script>`;
