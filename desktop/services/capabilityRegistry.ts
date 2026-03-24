import type { RegisteredTool } from "./toolRegistry.js";

export type CapabilityDescriptor = {
  capabilityId: string;
  label: string;
  description: string;
  toolNames: string[];
  sources: Array<RegisteredTool["source"]>;
  requiresApproval: boolean;
  networked: boolean;
  mutating: boolean;
};

type CapabilityRule = {
  capabilityId: string;
  label: string;
  description: string;
  match: (tool: RegisteredTool) => boolean;
};

const CAPABILITY_RULES: CapabilityRule[] = [
  {
    capabilityId: "filesystem",
    label: "Filesystem",
    description: "Inspect and change files inside the workspace.",
    match: (tool) =>
      tool.source === "native" &&
      ["list_dir", "search", "read_file", "write_file", "edit_file", "diff_status", "diff_file"].includes(tool.actualName),
  },
  {
    capabilityId: "patching",
    label: "Patching",
    description: "Apply structured patches to workspace files.",
    match: (tool) => tool.source === "native" && tool.actualName === "apply_patch",
  },
  {
    capabilityId: "shell",
    label: "Shell",
    description: "Execute shell commands in the active workspace.",
    match: (tool) => tool.source === "native" && tool.actualName === "run_command",
  },
  {
    capabilityId: "web-search",
    label: "Web Search",
    description: "Query an external search provider or fetch a web resource.",
    match: (tool) => tool.source === "native" && ["web_search", "http_fetch"].includes(tool.actualName),
  },
  {
    capabilityId: "media",
    label: "Media",
    description: "Generate or transform rich media assets such as images and audio.",
    match: (tool) => tool.source === "native" && ["generate_image", "text_to_speech"].includes(tool.actualName),
  },
  {
    capabilityId: "browser",
    label: "Browser",
    description: "Drive and inspect a persistent browser session.",
    match: (tool) => tool.source === "browser",
  },
  {
    capabilityId: "mcp",
    label: "MCP",
    description: "Use external Model Context Protocol tools from configured servers.",
    match: (tool) => tool.source === "mcp",
  },
];

function getMatchedRules(tool: RegisteredTool): CapabilityRule[] {
  return CAPABILITY_RULES.filter((rule) => rule.match(tool));
}

export function listCapabilityDescriptors(registeredTools: RegisteredTool[]): CapabilityDescriptor[] {
  const grouped = new Map<string, CapabilityDescriptor>();

  for (const tool of registeredTools) {
    const matches = getMatchedRules(tool);
    for (const rule of matches) {
      const existing = grouped.get(rule.capabilityId);
      const next: CapabilityDescriptor = {
        capabilityId: rule.capabilityId,
        label: rule.label,
        description: rule.description,
        toolNames: existing ? [...existing.toolNames, tool.publicName] : [tool.publicName],
        sources: existing ? [...existing.sources, tool.source] : [tool.source],
        requiresApproval:
          (existing?.requiresApproval ?? false) ||
          tool.metadata.capabilities.includes("requires_approval"),
        networked:
          (existing?.networked ?? false) ||
          tool.metadata.capabilities.includes("networked"),
        mutating:
          (existing?.mutating ?? false) ||
          tool.metadata.capabilities.includes("mutating"),
      };
      grouped.set(rule.capabilityId, next);
    }
  }

  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      toolNames: Array.from(new Set(entry.toolNames)).sort(),
      sources: Array.from(new Set(entry.sources)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
