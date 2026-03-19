import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wrench, ChevronDown, ChevronRight } from "lucide-react";
import { useMcpStore, type McpTool } from "../../stores/mcpStore";

type McpToolBrowserProps = {
  serverId: string;
};

export default function McpToolBrowser({ serverId }: McpToolBrowserProps) {
  const { t } = useTranslation();
  const { getTools } = useMcpStore();
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getTools(serverId).then((t) => {
      setTools(t);
      setLoading(false);
    });
  }, [serverId, getTools]);

  if (loading) {
    return <div className="text-xs text-text-secondary/50 py-2">{t("common.loading")}</div>;
  }

  if (tools.length === 0) {
    return <div className="text-xs text-text-secondary/50 py-2">{t("mcp.noTools")}</div>;
  }

  return (
    <div className="space-y-1">
      {tools.map((tool) => (
        <div key={tool.name} className="rounded-lg border border-border bg-bg-tertiary overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === tool.name ? null : tool.name)}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs cursor-pointer hover:bg-white/3 transition-colors"
          >
            {expanded === tool.name ? (
              <ChevronDown size={12} className="text-text-secondary shrink-0" />
            ) : (
              <ChevronRight size={12} className="text-text-secondary shrink-0" />
            )}
            <Wrench size={12} className="text-accent-blue shrink-0" />
            <span className="font-medium text-text-primary">{tool.name}</span>
            <span className="text-text-secondary/50 truncate flex-1 text-left">
              {tool.description}
            </span>
          </button>
          {expanded === tool.name && (
            <div className="px-3 pb-2 pt-0">
              <p className="text-xs text-text-secondary mb-2">{tool.description}</p>
              {tool.inputSchema && Object.keys(tool.inputSchema).length > 0 && (
                <pre className="text-[10px] text-text-secondary/60 bg-bg-primary rounded p-2 overflow-x-auto">
                  {JSON.stringify(tool.inputSchema, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
