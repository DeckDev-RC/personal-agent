import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Badge from "../shared/Badge";
import EmptyState from "../shared/EmptyState";
import { ScrollText } from "lucide-react";

type LogLevel = "error" | "warn" | "info" | "debug";

type LogEntry = {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
};

const LEVEL_BADGE_COLOR: Record<LogLevel, "red" | "orange" | "blue" | "gray"> = {
  error: "red",
  warn: "orange",
  info: "blue",
  debug: "gray",
};

const ALL_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];
const MAX_ENTRIES = 200;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

// Placeholder: generate some mock log data for demonstration purposes.
// Replace this with actual daemon log integration when available.
function generateMockLogs(): LogEntry[] {
  const messages: { level: LogLevel; message: string }[] = [
    { level: "info", message: "Daemon started on port 3100" },
    { level: "info", message: "Connected to model provider" },
    { level: "debug", message: "Session cache initialized (capacity: 100)" },
    { level: "info", message: "MCP server registry loaded (3 servers)" },
    { level: "warn", message: "Rate limit approaching for gpt-5.4-mini (80% utilization)" },
    { level: "debug", message: "Garbage collection completed in 12ms" },
    { level: "info", message: "New session created: sess_abc123" },
    { level: "info", message: "Run started: run_def456 (model: gpt-5.4)" },
    { level: "debug", message: "Token count for prompt: 1,247 tokens" },
    { level: "info", message: "Run completed: run_def456 (duration: 3.2s)" },
    { level: "warn", message: "Slow response detected (>5s) for session sess_xyz789" },
    { level: "error", message: "Failed to connect to MCP server 'filesystem': ECONNREFUSED" },
    { level: "info", message: "Retrying MCP connection in 5s..." },
    { level: "info", message: "MCP server 'filesystem' reconnected successfully" },
    { level: "debug", message: "Session sess_abc123 persisted to disk" },
  ];

  const now = Date.now();
  return messages.map((m, i) => ({
    id: `log-${i}`,
    timestamp: now - (messages.length - i) * 2000,
    level: m.level,
    message: m.message,
  }));
}

type FilterOption = "all" | LogLevel;

export default function LogsView() {
  const { t } = useTranslation();
  const [logs] = useState<LogEntry[]>(() => generateMockLogs());
  const [filter, setFilter] = useState<FilterOption>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const filtered = filter === "all"
    ? logs.slice(-MAX_ENTRIES)
    : logs.filter((l) => l.level === filter).slice(-MAX_ENTRIES);

  // Auto-scroll to bottom when new entries appear
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Consider "at bottom" if within 40px of the bottom
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  }, []);

  const filterButtons: { key: FilterOption; label: string }[] = [
    { key: "all", label: t("logs.all", "All") },
    { key: "error", label: t("logs.error", "Error") },
    { key: "warn", label: t("logs.warn", "Warn") },
    { key: "info", label: t("logs.info", "Info") },
    { key: "debug", label: t("logs.debug", "Debug") },
  ];

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header */}
      <h1 className="text-lg font-semibold text-text-primary">
        {t("logs.title", "Logs")}
      </h1>

      {/* Filter buttons */}
      <div className="flex items-center gap-1.5">
        {filterButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              filter === btn.key
                ? "bg-white/10 text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-white/5"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Log list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={32} />}
          title={t("logs.empty", "No log entries")}
          description={t(
            "logs.emptyDescription",
            "Log entries will appear here once the daemon produces output."
          )}
        />
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-bg-secondary border border-border rounded-xl p-2"
        >
          <div className="flex flex-col gap-0.5">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-2 py-1 rounded hover:bg-white/5"
              >
                <span className="text-[10px] text-text-secondary shrink-0 font-mono leading-5 min-w-[85px]">
                  {formatTime(entry.timestamp)}
                </span>
                <span className="shrink-0 mt-px">
                  <Badge color={LEVEL_BADGE_COLOR[entry.level]}>
                    {entry.level.toUpperCase()}
                  </Badge>
                </span>
                <span className="text-xs text-text-primary font-mono leading-5 break-all">
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
