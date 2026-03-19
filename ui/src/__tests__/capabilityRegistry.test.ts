import { describe, expect, it } from "vitest";
import { listCapabilityDescriptors } from "../../../desktop/services/capabilityRegistry.js";
import type { RegisteredTool } from "../../../desktop/services/toolRegistry.js";

function makeTool(tool: Partial<RegisteredTool> & Pick<RegisteredTool, "publicName" | "actualName" | "source">): RegisteredTool {
  return {
    publicName: tool.publicName,
    actualName: tool.actualName,
    source: tool.source,
    metadata: tool.metadata ?? { capabilities: ["read_only"], defaultTimeoutMs: 1000 },
    tool: tool.tool ?? {
      name: tool.publicName,
      description: tool.publicName,
      parameters: { type: "object", properties: {} },
    },
    serverId: tool.serverId,
    serverName: tool.serverName,
  };
}

describe("capabilityRegistry", () => {
  it("groups native, browser, and MCP tools into explicit capability descriptors", () => {
    const descriptors = listCapabilityDescriptors([
      makeTool({ publicName: "read_file", actualName: "read_file", source: "native" }),
      makeTool({
        publicName: "apply_patch",
        actualName: "apply_patch",
        source: "native",
        metadata: { capabilities: ["mutating", "requires_approval"], defaultTimeoutMs: 1000 },
      }),
      makeTool({ publicName: "browser_open", actualName: "browser_open", source: "browser" }),
      makeTool({ publicName: "search_docs", actualName: "search_docs", source: "mcp", serverId: "docs", serverName: "Docs" }),
    ]);

    expect(descriptors.map((entry) => entry.capabilityId)).toEqual([
      "browser",
      "filesystem",
      "mcp",
      "patching",
    ]);
    expect(descriptors.find((entry) => entry.capabilityId === "patching")?.requiresApproval).toBe(true);
    expect(descriptors.find((entry) => entry.capabilityId === "filesystem")?.toolNames).toContain("read_file");
  });
});
