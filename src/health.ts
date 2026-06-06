import { createServer, type Server } from "node:http";
import type { Logger } from "pino";

export function startHealthServer(
  isReady: () => boolean,
  port: number,
  logger: Logger,
): Server {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      if (isReady()) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "unavailable" }));
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger.info({ event: "health_server_listening", port });
  });

  return server;
}
