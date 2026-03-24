import * as http from "node:http";

type GatewayConfig = {
  enabled: boolean;
  port: number;
  apiKey: string;
};

let server: http.Server | null = null;
let config: GatewayConfig = { enabled: false, port: 3100, apiKey: "" };

type RequestHandler = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => Promise<void>;

const routes = new Map<string, Map<string, RequestHandler>>();

function addRoute(method: string, path: string, handler: RequestHandler): void {
  if (!routes.has(method)) routes.set(method, new Map());
  routes.get(method)!.set(path, handler);
}

function matchRoute(method: string, pathname: string): { handler: RequestHandler; params: Record<string, string> } | null {
  const methodRoutes = routes.get(method);
  if (!methodRoutes) return null;

  // Exact match
  const exact = methodRoutes.get(pathname);
  if (exact) return { handler: exact, params: {} };

  // Pattern match
  for (const [pattern, handler] of methodRoutes) {
    const patternParts = pattern.split("/");
    const pathParts = pathname.split("/");
    if (patternParts.length !== pathParts.length) continue;
    const params: Record<string, string> = {};
    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(":")) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { handler, params };
  }
  return null;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Import handlers lazily to avoid circular deps
let daemonHandlers: Record<string, (...args: any[]) => Promise<any>> | null = null;

async function getDaemonHandlers(): Promise<Record<string, (...args: any[]) => Promise<any>>> {
  if (!daemonHandlers) {
    const taskManager = await import("./taskManager.js");
    const sessionManager = await import("./v2EntityStore.js");
    const analyticsCollector = await import("./analyticsCollector.js");
    const knowledgeBase = await import("./knowledgeBase.js");
    daemonHandlers = {
      listTasks: taskManager.listTasks,
      createTask: taskManager.createTask,
      getSettings: sessionManager.getSettingsV2,
      trackEvent: analyticsCollector.trackEvent,
      listEvents: analyticsCollector.listEvents,
      searchKnowledge: knowledgeBase.searchKnowledgeBase,
    };
  }
  return daemonHandlers;
}

function registerRoutes(): void {
  // Health check
  addRoute("GET", "/api/health", async (_req, res) => {
    sendJson(res, 200, { status: "ok", version: "2.0.0", uptime: process.uptime() });
  });

  // Tasks
  addRoute("GET", "/api/tasks", async (_req, res) => {
    const handlers = await getDaemonHandlers();
    const tasks = await handlers.listTasks();
    sendJson(res, 200, { tasks });
  });

  addRoute("POST", "/api/tasks", async (_req, res, body) => {
    const handlers = await getDaemonHandlers();
    const data = JSON.parse(body);
    const task = await handlers.createTask(data);
    sendJson(res, 201, { task });
  });

  // Analytics
  addRoute("GET", "/api/analytics/events", async (_req, res) => {
    const handlers = await getDaemonHandlers();
    const events = await handlers.listEvents({ limit: 100 });
    sendJson(res, 200, { events });
  });

  addRoute("POST", "/api/analytics/track", async (_req, res, body) => {
    const handlers = await getDaemonHandlers();
    const { eventType, metadata } = JSON.parse(body);
    const event = await handlers.trackEvent(eventType, metadata);
    sendJson(res, 201, { event });
  });

  // Settings
  addRoute("GET", "/api/settings", async (_req, res) => {
    const handlers = await getDaemonHandlers();
    const settings = await handlers.getSettings();
    sendJson(res, 200, { settings });
  });

  // Knowledge search
  addRoute("POST", "/api/knowledge/search", async (_req, res, body) => {
    const handlers = await getDaemonHandlers();
    const { query, limit } = JSON.parse(body);
    const results = await handlers.searchKnowledge(query, limit);
    sendJson(res, 200, { results });
  });

  // Info
  addRoute("GET", "/api/info", async (_req, res) => {
    sendJson(res, 200, {
      name: "OpenClaw Gateway",
      version: "2.0.0",
      endpoints: [
        "GET /api/health",
        "GET /api/tasks",
        "POST /api/tasks",
        "GET /api/analytics/events",
        "POST /api/analytics/track",
        "GET /api/settings",
        "POST /api/knowledge/search",
        "GET /api/info",
      ],
    });
  });
}

export function getGatewayConfig(): GatewayConfig {
  return { ...config };
}

export function setGatewayConfig(newConfig: Partial<GatewayConfig>): GatewayConfig {
  config = { ...config, ...newConfig };
  return config;
}

export async function startGateway(cfg?: Partial<GatewayConfig>): Promise<{ port: number }> {
  if (cfg) config = { ...config, ...cfg };
  if (server) await stopGateway();

  registerRoutes();

  server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    // Auth check
    if (config.apiKey) {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${config.apiKey}`) {
        sendJson(res, 401, { error: "Unauthorized" });
        return;
      }
    }

    const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);
    const match = matchRoute(req.method ?? "GET", url.pathname);

    if (!match) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    try {
      const body = await readBody(req);
      await match.handler(req, res, body);
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message ?? "Internal error" });
    }
  });

  return new Promise((resolve, reject) => {
    server!.listen(config.port, "127.0.0.1", () => {
      resolve({ port: config.port });
    });
    server!.on("error", reject);
  });
}

export async function stopGateway(): Promise<void> {
  if (!server) return;
  return new Promise((resolve) => {
    server!.close(() => {
      server = null;
      resolve();
    });
  });
}

export function isGatewayRunning(): boolean {
  return server !== null && server.listening;
}
