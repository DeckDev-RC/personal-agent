import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, RefreshCw, Store, Wrench } from "lucide-react";
import type { McpCatalogField, McpServerConfig, McpServerStatus } from "../../../../src/types/mcp.js";
import { useMcpStore } from "../../stores/mcpStore";
import Badge from "../shared/Badge";
import Button from "../shared/Button";

function readFieldValue(server: McpServerConfig | undefined, field: McpCatalogField): string {
  if (!server) {
    return field.defaultValue ?? "";
  }

  if (field.kind === "env") {
    return server.env?.[field.key] ?? field.defaultValue ?? "";
  }

  if (field.kind === "arg") {
    return server.args?.[field.index] ?? field.defaultValue ?? "";
  }

  if (field.kind === "url") {
    return server.url ?? field.defaultValue ?? "";
  }

  return server.cwd ?? field.defaultValue ?? "";
}

type McpMarketplaceProps = {
  statuses: McpServerStatus[];
};

export default function McpMarketplace({ statuses }: McpMarketplaceProps) {
  const { t } = useTranslation();
  const { catalog, installCatalogServer, findServerForCatalog } = useMcpStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fieldState, setFieldState] = useState<Record<string, Record<string, string>>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const catalogEntries = useMemo(() => catalog, [catalog]);

  async function handleInstall(catalogId: string) {
    setBusyId(catalogId);
    const result = await installCatalogServer(catalogId, fieldState[catalogId] ?? {});
    setBusyId(null);
    setFeedback((current) => ({
      ...current,
      [catalogId]: result.ok
        ? t("mcp.marketplaceSaved")
        : result.error ?? t("common.error"),
    }));
  }

  return (
    <section className="rounded-2xl border border-border bg-bg-secondary/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Store size={16} className="text-accent-blue" />
            {t("mcp.marketplaceTitle")}
          </div>
          <p className="mt-1 text-xs text-text-secondary/70">
            {t("mcp.marketplaceDescription")}
          </p>
        </div>
        <Badge color="blue">{catalogEntries.length}</Badge>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {catalogEntries.map((entry) => {
          const installed = findServerForCatalog(entry.id);
          const status = installed ? statuses.find((item) => item.id === installed.id) : undefined;
          const isConnected = status?.connected ?? false;
          const isBusy = busyId === entry.id;

          return (
            <div key={entry.id} className="rounded-xl border border-border bg-bg-primary/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium text-text-primary">{entry.name}</h2>
                    <Badge color="gray">{entry.category}</Badge>
                    {isConnected && <Badge color="green">{t("mcp.connected")}</Badge>}
                    {!isConnected && installed && <Badge color="orange">{t("mcp.disconnected")}</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary/75">
                    {entry.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-text-secondary/60">
                    {entry.packageName && <span>{entry.packageName}</span>}
                    {entry.maintainer && <span>{entry.maintainer}</span>}
                  </div>
                </div>

                <Button
                  variant={isConnected ? "secondary" : "primary"}
                  size="sm"
                  onClick={() => void handleInstall(entry.id)}
                  disabled={isBusy}
                >
                  {isBusy ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {installed ? t("mcp.marketplaceReconnect") : t("mcp.marketplaceConnect")}
                </Button>
              </div>

              {entry.setupHint && (
                <p className="mt-3 rounded-lg border border-border bg-bg-secondary/70 px-3 py-2 text-[11px] leading-relaxed text-text-secondary/75">
                  {entry.setupHint}
                </p>
              )}

              {(entry.fields?.length ?? 0) > 0 && (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {entry.fields?.map((field) => {
                    const value = fieldState[entry.id]?.[field.id] ?? readFieldValue(installed, field);
                    return (
                      <label key={field.id} className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-text-secondary">
                          {field.label}
                          {field.required ? " *" : ""}
                        </span>
                        <input
                          type={field.secret ? "password" : "text"}
                          value={value}
                          onChange={(event) =>
                            setFieldState((current) => ({
                              ...current,
                              [entry.id]: {
                                ...(current[entry.id] ?? {}),
                                [field.id]: event.target.value,
                              },
                            }))
                          }
                          placeholder={field.placeholder}
                          className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-blue/50"
                        />
                        {field.helperText && (
                          <span className="text-[10px] text-text-secondary/55">{field.helperText}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}

              {entry.recommendedTools?.length ? (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">
                    <Wrench size={11} />
                    {t("mcp.marketplaceSuggestedTools")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.recommendedTools.map((toolName) => (
                      <Badge key={toolName} color="gray" className="text-[10px]">
                        {toolName}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {feedback[entry.id] && (
                <div
                  className={`mt-3 text-xs ${
                    feedback[entry.id] === t("mcp.marketplaceSaved")
                      ? "text-accent-green"
                      : "text-red-300"
                  }`}
                >
                  {feedback[entry.id]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
