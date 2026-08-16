import { createStampdUpServer } from "./site.js";

const parsedPort = Number.parseInt(process.env.PORT ?? "3000", 10);
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
const host = "0.0.0.0";

const server = createStampdUpServer();

server.listen(port, host, () => {
  console.log(`StampdUp Travel server listening on http://${host}:${port}`);
});
