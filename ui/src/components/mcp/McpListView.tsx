import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Plug, Trash2, Power, PowerOff, ChevronDown, ChevronRight } from "lucide-react";
import { useMcpStore, type McpServerConfig, type McpServerStatus } from "../../stores/mcpStore";
import Button from "../shared/Button";
import Badge from "../shared/Badge";
import McpEditor from "./McpEditor";
import McpToolBrowser from "./McpToolBrowser";

export default function McpListView() {
  const { t } = useTranslation();
  const { servers, statuses, loaded, loadServers, deleteServer, connectServer, disconnectServer, updateServer } =
    useMcpStore();
  const [editing, setEditing] = useState<McpServerConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedTools, setExpandedTools] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) loadServers();
  }, [loaded, loadServers]);

  function getStatus(id: string): McpServerStatus | undefined {
    return statuses.find((s) => s.id === id);
  }

  async function handleConnect(server: McpServerConfig) {
    setConnecting(server.id);
    await connectServer(server);
    setConnecting(null);
  }

  async function handleDisconnect(id: string) {
    await disconnectServer(id);
  }

  async function handleToggleEnabled(server: McpServerConfig) {
    const nextEnabled = !server.enabled;
    await updateServer({ ...server, enabled: nextEnabled });
    if (nextEnabled) {
      await connectServer({ ...server, enabled: true });
    } else {
      await disconnectServer(server.id);
    }
  }

  if (editing || creating) {
    return (
      <McpEditor
        server={editing ?? undefined}
        onClose={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-text-primary">{t("mcp.title")}</h1>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} />
            {t("mcp.add")}
          </Button>
        </div>

        {servers.length === 0 ? (
          <div className="text-center py-12 text-text-secondary text-sm">
            {t("mcp.noServers")}
          </div>
        ) : (
          <div className="grid gap-3">
            {servers.map((server) => {
              const status = getStatus(server.id);
              const isConnected = status?.connected ?? false;
              const isConnecting = connecting === server.id;

              return (
                <div
                  key={server.id}
                  className="rounded-xl border border-border bg-bg-secondary overflow-hidden"
                >
                  <div className="flex items-start gap-4 p-4">
                    <div
                      className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5 ${
                        isConnected
                          ? "bg-accent-green/10 text-accent-green"
                          : "bg-white/5 text-text-secondary"
                      }`}
                    >
                      <Plug size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {server.name}
                        </span>
                        <Badge color={server.type === "stdio" ? "blue" : "orange"}>
                          {server.type}
                        </Badge>
                        <Badge color={server.enabled ? "green" : "gray"}>
                          {server.enabled ? "enabled" : "disabled"}
                        </Badge>
                        {isConnected ? (
                          <Badge color="green">{t("mcp.connected")}</Badge>
                        ) : status?.error ? (
                          <Badge color="red">{t("mcp.error")}</Badge>
                        ) : (
                          <Badge color="gray">{t("mcp.disconnected")}</Badge>
                        )}
                        {status && status.toolCount > 0 && (
                          <span className="text-[10px] text-text-secondary/50">
                            {status.toolCount} {t("mcp.tools").toLowerCase()}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-text-secondary/60 font-mono truncate">
                        {server.type === "stdio"
                          ? `${server.command} ${server.args?.join(" ") ?? ""}`
                          : server.url}
                      </p>
                      {status?.error && (
                        <p className="mt-1 text-xs text-red-400/80 truncate">{status.error}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleEnabled(server)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
                          server.enabled
                            ? "text-accent-green hover:bg-accent-green/10"
                            : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                        }`}
                        title={t("mcp.enabled")}
                      >
                        {server.enabled ? "ON" : "OFF"}
                      </button>
                      {isConnected ? (
                        <button
                          onClick={() => handleDisconnect(server.id)}
                          className="p-1.5 rounded-lg text-accent-orange hover:bg-accent-orange/10 transition-colors cursor-pointer"
                          title="Desconectar"
                        >
                          <PowerOff size={13} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(server)}
                          disabled={isConnecting}
                          className="p-1.5 rounded-lg text-accent-green hover:bg-accent-green/10 transition-colors cursor-pointer disabled:opacity-30"
                          title="Conectar"
                        >
                          <Power size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => setEditing(server)}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer text-xs"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deleteServer(server.id)}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Tools expandable */}
                  {isConnected && (
                    <div className="border-t border-border">
                      <button
                        onClick={() =>
                          setExpandedTools(expandedTools === server.id ? null : server.id)
                        }
                        className="flex items-center gap-2 w-full px-4 py-2 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                      >
                        {expandedTools === server.id ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronRight size={12} />
                        )}
                        {t("mcp.tools")} ({status?.toolCount ?? 0})
                      </button>
                      {expandedTools === server.id && (
                        <div className="px-4 pb-3">
                          <McpToolBrowser serverId={server.id} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
