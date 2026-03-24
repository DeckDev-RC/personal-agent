import {
  getGatewayConfig,
  setGatewayConfig,
  startGateway,
  stopGateway,
  isGatewayRunning,
} from "../services/gatewayServer.js";

describe("gatewayServer", () => {
  afterEach(async () => {
    await stopGateway();
  });

  describe("config management", () => {
    it("returns default config", () => {
      const config = getGatewayConfig();
      expect(config.enabled).toBe(false);
      expect(config.port).toBe(3100);
      expect(config.apiKey).toBe("");
    });

    it("merges partial config", () => {
      setGatewayConfig({ port: 4000 });
      const config = getGatewayConfig();
      expect(config.port).toBe(4000);
      expect(config.enabled).toBe(false); // unchanged
      // Reset for other tests
      setGatewayConfig({ port: 3100 });
    });
  });

  describe("server lifecycle", () => {
    it("starts and reports running", async () => {
      const result = await startGateway({ port: 43901, apiKey: "" });
      expect(result.port).toBe(43901);
      expect(isGatewayRunning()).toBe(true);
    });

    it("stops and reports not running", async () => {
      await startGateway({ port: 43902, apiKey: "" });
      await stopGateway();
      expect(isGatewayRunning()).toBe(false);
    });
  });

  describe("HTTP endpoints", () => {
    it("GET /api/health returns 200", async () => {
      await startGateway({ port: 43903, apiKey: "" });
      const res = await fetch("http://127.0.0.1:43903/api/health");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
    });

    it("GET /api/info returns endpoint list", async () => {
      await startGateway({ port: 43904, apiKey: "" });
      const res = await fetch("http://127.0.0.1:43904/api/info");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.endpoints).toBeDefined();
      expect(Array.isArray(data.endpoints)).toBe(true);
    });

    it("returns 404 for unknown routes", async () => {
      await startGateway({ port: 43905, apiKey: "" });
      const res = await fetch("http://127.0.0.1:43905/api/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("auth check", () => {
    it("returns 401 when apiKey is set and no auth header", async () => {
      await startGateway({ port: 43906, apiKey: "secret123" });
      const res = await fetch("http://127.0.0.1:43906/api/health");
      expect(res.status).toBe(401);
    });

    it("returns 401 when auth header is wrong", async () => {
      await startGateway({ port: 43907, apiKey: "secret123" });
      const res = await fetch("http://127.0.0.1:43907/api/health", {
        headers: { Authorization: "Bearer wrong" },
      });
      expect(res.status).toBe(401);
    });

    it("allows request when auth header matches", async () => {
      await startGateway({ port: 43908, apiKey: "secret123" });
      const res = await fetch("http://127.0.0.1:43908/api/health", {
        headers: { Authorization: "Bearer secret123" },
      });
      expect(res.status).toBe(200);
    });

    it("allows request when no apiKey configured", async () => {
      await startGateway({ port: 43909, apiKey: "" });
      const res = await fetch("http://127.0.0.1:43909/api/health");
      expect(res.status).toBe(200);
    });
  });

  describe("CORS", () => {
    it("OPTIONS returns 204 with CORS headers", async () => {
      await startGateway({ port: 43910, apiKey: "" });
      const res = await fetch("http://127.0.0.1:43910/api/health", { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });
});
