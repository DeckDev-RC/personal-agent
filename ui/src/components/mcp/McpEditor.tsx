import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save } from "lucide-react";
import { useMcpStore, type McpServerConfig } from "../../stores/mcpStore";
import Button from "../shared/Button";
import Input from "../shared/Input";
import { TextArea } from "../shared/Input";

type McpEditorProps = {
  server?: McpServerConfig;
  onClose: () => void;
};

export default function McpEditor({ server, onClose }: McpEditorProps) {
  const { t } = useTranslation();
  const { createServer, updateServer } = useMcpStore();
  const isNew = !server;

  const [name, setName] = useState(server?.name ?? "");
  const [type, setType] = useState<"stdio" | "http">(server?.type ?? "stdio");
  const [command, setCommand] = useState(server?.command ?? "");
  const [args, setArgs] = useState(server?.args?.join(" ") ?? "");
  const [envText, setEnvText] = useState(
    server?.env
      ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join("\n")
      : "",
  );
  const [cwd, setCwd] = useState(server?.cwd ?? "");
  const [url, setUrl] = useState(server?.url ?? "");
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  function parseArgs(input: string): string[] {
    return input.split(/\s+/).filter(Boolean);
  }

  function parseEnv(input: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of input.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
    return env;
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data: Partial<McpServerConfig> = {
        name: name.trim(),
        type,
        enabled,
      };
      if (type === "stdio") {
        data.command = command.trim();
        data.args = parseArgs(args);
        data.env = parseEnv(envText);
        data.cwd = cwd.trim() || undefined;
      } else {
        data.url = url.trim();
      }

      if (isNew) {
        await createServer(data);
      } else {
        await updateServer({ ...server, ...data } as McpServerConfig);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-semibold text-text-primary">
            {isNew ? t("mcp.add") : t("mcp.edit")}
          </h1>
        </div>

        <div className="space-y-5">
          <Input
            label={t("mcp.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Filesystem, GitHub, Browser..."
          />

          <div className="flex items-center justify-between rounded-lg border border-border bg-bg-tertiary px-3 py-2">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text-secondary">{t("mcp.enabled")}</span>
              <span className="text-[10px] text-text-secondary/50">
                Auto-connect on startup and make this server available to agents.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEnabled((value) => !value)}
              className={`rounded-lg px-3 py-1 text-xs font-medium cursor-pointer transition-colors ${
                enabled
                  ? "bg-accent-green/15 text-accent-green border border-accent-green/20"
                  : "bg-white/5 text-text-secondary border border-border"
              }`}
            >
              {enabled ? "ON" : "OFF"}
            </button>
          </div>

          {/* Type selector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">{t("mcp.type")}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType("stdio")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  type === "stdio"
                    ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/30"
                    : "bg-white/5 text-text-secondary border border-border hover:text-text-primary"
                }`}
              >
                {t("mcp.stdio")}
              </button>
              <button
                onClick={() => setType("http")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  type === "http"
                    ? "bg-accent-orange/20 text-accent-orange border border-accent-orange/30"
                    : "bg-white/5 text-text-secondary border border-border hover:text-text-primary"
                }`}
              >
                {t("mcp.http")}
              </button>
            </div>
          </div>

          {type === "stdio" ? (
            <>
              <Input
                label={t("mcp.command")}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx, node, python..."
              />
              <Input
                label={t("mcp.args")}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="@modelcontextprotocol/server-filesystem /tmp"
              />
              <TextArea
                label={t("mcp.env")}
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                placeholder={"CHAVE=valor\nOUTRA=valor"}
                className="min-h-16 font-mono text-xs"
              />
              <Input
                label="CWD"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="Diretório de trabalho (opcional)"
              />
            </>
          ) : (
            <Input
              label={t("mcp.url")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:3000/sse"
            />
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button variant="primary" onClick={handleSave} disabled={!name.trim() || saving}>
              <Save size={14} />
              {t("common.save")}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
