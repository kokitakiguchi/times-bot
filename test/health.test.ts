import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { Logger } from "pino";

import { startHealthServer } from "../src/health.js";

const silentLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

async function getResponse(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    import("node:http").then(({ request }) => {
      const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on("error", reject);
      req.end();
    });
  });
}

describe("startHealthServer", () => {
  it("returns 200 when isReady returns true", async () => {
    const server = startHealthServer(() => true, 0, silentLogger);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as { port: number };

    const res = await getResponse(port, "/healthz");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ok" });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 503 when isReady returns false", async () => {
    const server = startHealthServer(() => false, 0, silentLogger);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as { port: number };

    const res = await getResponse(port, "/healthz");
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ status: "unavailable" });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 404 for unknown paths", async () => {
    const server = startHealthServer(() => true, 0, silentLogger);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as { port: number };

    const res = await getResponse(port, "/unknown");
    expect(res.status).toBe(404);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
