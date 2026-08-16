import { createServer, type ServerResponse } from "node:http";

const parsedPort = Number.parseInt(process.env.PORT ?? "3000", 10);
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
const host = "0.0.0.0";

const pageStyles = `
  :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fffaf2; color: #17352d; }
  main { width: min(760px, calc(100% - 40px)); margin: 0 auto; padding: 96px 0; }
  .eyebrow { color: #b94c2f; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  h1 { max-width: 680px; margin: 12px 0 20px; font-size: clamp(2.5rem, 8vw, 5rem); line-height: .98; }
  p { max-width: 620px; font-size: 1.2rem; line-height: 1.7; }
  a.button { display: inline-block; margin-top: 20px; padding: 14px 22px; border-radius: 999px; background: #17352d; color: white; font-weight: 700; text-decoration: none; }
`;

function sendHtml(response: ServerResponse, title: string, content: string): void {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>${pageStyles}</style>
  </head>
  <body><main>${content}</main></body>
</html>`);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method !== "GET") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8", Allow: "GET" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (url.pathname === "/") {
    sendHtml(response, "StampdUp Travel", `
      <div class="eyebrow">StampdUp Travel</div>
      <h1>Arrive ready. Travel confidently.</h1>
      <p>Practical destination guides and travel tools for smoother arrivals and better first days abroad.</p>
      <a class="button" href="/philippines-arrival-checklist">View the Philippines checklist</a>
    `);
    return;
  }

  if (url.pathname === "/philippines-arrival-checklist") {
    sendHtml(response, "Philippines Arrival Checklist | StampdUp Travel", `
      <div class="eyebrow">StampdUp Travel</div>
      <h1>Philippines Arrival Checklist</h1>
      <p>A simple first-72-hours checklist for first-time Philippines travelers and digital nomads.</p>
      <a class="button" href="#checklist">Get the free checklist</a>
      <p id="checklist">The downloadable checklist is coming soon.</p>
    `);
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, host, () => {
  console.log(`StampdUp Travel server listening on http://${host}:${port}`);
});
