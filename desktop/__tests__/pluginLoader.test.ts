import { createTestDb } from "./helpers/testDb.js";

vi.mock("../services/v2Db.js", () => ({ ensureV2Db: vi.fn() }));
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => '{"id":"test","name":"Test Plugin","version":"1.0.0","description":"Test"}'),
    readdirSync: vi.fn(() => []),
    rmSync: vi.fn(),
  },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{"id":"test","name":"Test Plugin","version":"1.0.0","description":"Test"}'),
  readdirSync: vi.fn(() => []),
  rmSync: vi.fn(),
}));

import { ensureV2Db } from "../services/v2Db.js";
import {
  listPlugins,
  getPlugin,
  installPlugin,
  activatePlugin,
  deactivatePlugin,
  uninstallPlugin,
  getActivePluginMcpServers,
  getActivePluginSkills,
} from "../services/pluginLoader.js";

describe("pluginLoader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const db = createTestDb();
    vi.mocked(ensureV2Db).mockResolvedValue(db as any);
  });

  describe("CRUD", () => {
    it("installs a plugin and persists to DB", async () => {
      const manifest = {
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        description: "A test plugin",
        author: "Test Author",
      };
      const record = await installPlugin(manifest);
      expect(record.id).toBe("test-plugin");
      expect(record.status).toBe("installed");
      expect(record.manifest.name).toBe("Test Plugin");
    });

    it("lists installed plugins", async () => {
      await installPlugin({ id: "p1", name: "P1", version: "1.0", description: "d", author: "a" });
      await installPlugin({ id: "p2", name: "P2", version: "1.0", description: "d", author: "a" });
      const plugins = await listPlugins();
      expect(plugins.length).toBe(2);
    });

    it("gets a plugin by id", async () => {
      await installPlugin({ id: "p1", name: "P1", version: "1.0", description: "d", author: "a" });
      const found = await getPlugin("p1");
      expect(found).not.toBeNull();
      expect(found!.id).toBe("p1");
    });

    it("returns null for non-existent plugin", async () => {
      const found = await getPlugin("nonexistent");
      expect(found).toBeNull();
    });

    it("activates a plugin", async () => {
      await installPlugin({ id: "p1", name: "P1", version: "1.0", description: "d", author: "a" });
      const activated = await activatePlugin("p1");
      expect(activated).not.toBeNull();
      expect(activated!.status).toBe("active");
    });

    it("deactivates a plugin", async () => {
      await installPlugin({ id: "p1", name: "P1", version: "1.0", description: "d", author: "a" });
      await activatePlugin("p1");
      const deactivated = await deactivatePlugin("p1");
      expect(deactivated).not.toBeNull();
      expect(deactivated!.status).toBe("disabled");
    });

    it("returns null when activating non-existent plugin", async () => {
      const result = await activatePlugin("nonexistent");
      expect(result).toBeNull();
    });

    it("uninstalls a plugin and returns true", async () => {
      await installPlugin({ id: "p1", name: "P1", version: "1.0", description: "d", author: "a" });
      const result = await uninstallPlugin("p1");
      expect(result).toBe(true);
      const found = await getPlugin("p1");
      expect(found).toBeNull();
    });

    it("returns false when uninstalling non-existent plugin", async () => {
      const result = await uninstallPlugin("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("active plugin queries", () => {
    it("getActivePluginMcpServers returns servers only from active plugins", async () => {
      await installPlugin({
        id: "p1", name: "P1", version: "1.0", description: "d", author: "a",
        mcpServers: [{ id: "s1", name: "Server 1", transport: "stdio" }],
      });
      await installPlugin({
        id: "p2", name: "P2", version: "1.0", description: "d", author: "a",
        mcpServers: [{ id: "s2", name: "Server 2", transport: "stdio" }],
      });

      // Only activate p1
      await activatePlugin("p1");

      const servers = await getActivePluginMcpServers();
      expect(servers.length).toBe(1);
      expect(servers[0].pluginId).toBe("p1");
      expect(servers[0].server.id).toBe("s1");
    });

    it("getActivePluginSkills returns skills only from active plugins", async () => {
      await installPlugin({
        id: "p1", name: "P1", version: "1.0", description: "d", author: "a",
        skills: [{ id: "sk1", name: "Skill 1", description: "d", type: "prompt" }],
      });

      // Not activated — should return empty
      const skills = await getActivePluginSkills();
      expect(skills.length).toBe(0);

      // Activate
      await activatePlugin("p1");
      const activeSkills = await getActivePluginSkills();
      expect(activeSkills.length).toBe(1);
    });
  });
});
