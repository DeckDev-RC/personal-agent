import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Plug, ShieldCheck, ShieldX, Database, Wifi, WifiOff } from "lucide-react";
import Badge from "../shared/Badge";
import { useChatStore } from "../../stores/chatStore";
import { useRuntimeStore } from "../../stores/runtimeStore";
import { useSettingsStore } from "../../stores/settingsStore";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatTokenCount(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
}

export default function StatusBar() {
  const { t } = useTranslation();
  const activeConversation = useChatStore((state) => state.activeConversation);
  const streamingText = useChatStore((state) => state.streamingText);
  const { status, refreshStatus } = useRuntimeStore();
  const compactAtTokens = useSettingsStore((state) => state.settings.compactAtTokens);
  const planMode = useSettingsStore((state) => state.settings.planMode);
  const fastMode = useSettingsStore((state) => state.settings.fastMode);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    refreshStatus();
    const interval = window.setInterval(() => {
      refreshStatus();
      (window as any).codexAgent?.connectivity?.status?.().then((s: any) => {
        if (s && typeof s.online === "boolean") setOnline(s.online);
      }).catch(() => {});
    }, 30000);
    return () => window.clearInterval(interval);
  }, [refreshStatus]);

  const contextStats = useMemo(() => {
    const contextWindow = status?.modelContextWindow ?? 128000;
    const systemPromptTokens = estimateTokens(activeConversation?.systemPrompt ?? "");
    const messageTokens = (activeConversation?.messages ?? []).reduce((total, message) => {
      return total + estimateTokens(message.content) + estimateTokens(message.thinkingContent ?? "");
    }, 0);
    const streamingTokens = estimateTokens(streamingText);
    const used = systemPromptTokens + messageTokens + streamingTokens;
    const remaining = Math.max(0, contextWindow - used);
    return { contextWindow, used, remaining };
  }, [activeConversation, status?.modelContextWindow, streamingText]);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border bg-bg-secondary/80 px-4 py-2 text-[11px] text-text-secondary backdrop-blur">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5">
          {status?.authenticated ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
          <span>{status?.authenticated ? t("statusBar.oauthConnected") : t("statusBar.oauthDisconnected")}</span>
          {status?.email && <span className="truncate max-w-[220px]">({status.email})</span>}
          {status?.activeProvider && <Badge color="gray">{status.activeProvider}</Badge>}
        </div>

        <div className="flex items-center gap-1.5">
          <Plug size={12} />
          <span>
            MCP {status?.mcpConnectedCount ?? 0}/{status?.mcpEnabledCount ?? 0}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Database size={12} />
          <span>
            Context {formatTokenCount(contextStats.used)}/{formatTokenCount(contextStats.contextWindow)}
          </span>
          <Badge color="gray">{formatTokenCount(contextStats.remaining)} {t("statusBar.remaining")}</Badge>
          <Badge color="gray">{t("statusBar.compactAt")}{formatTokenCount(compactAtTokens)}</Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {planMode && <Badge color="blue">{t("statusBar.plan")}</Badge>}
        {fastMode && <Badge color="orange">{t("statusBar.fast")}</Badge>}
        {status?.usagePlan && <Badge color="blue">{status.usagePlan}</Badge>}
        {status?.usageWindows.map((window) => (
          <Badge key={window.label} color={window.remainingPercent > 30 ? "green" : window.remainingPercent > 10 ? "orange" : "red"}>
            {window.label} {window.remainingPercent.toFixed(0)}%
          </Badge>
        ))}
        {status?.usageError && <Badge color="red">{status.usageError}</Badge>}
        <div className="flex items-center gap-1.5">
          {online ? <Wifi size={12} className="text-green-400" /> : <WifiOff size={12} className="text-red-400" />}
          <span>{online ? t("statusBar.online", "Online") : t("statusBar.offline", "Offline")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity size={12} />
          <span>{t("statusBar.output")} {formatTokenCount(status?.maxOutputTokens ?? 4096)}</span>
        </div>
      </div>
    </div>
  );
}
