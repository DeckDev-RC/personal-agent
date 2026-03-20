import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  MessageSquare,
  FolderTree,
  Bot,
  Zap,
  GitBranch,
  Plug,
  Settings,
  Languages,
} from "lucide-react";
import type { NavView } from "./Sidebar";

type Command = {
  id: string;
  label: string;
  icon: React.ElementType;
  action: () => void;
};

function scoreCommand(label: string, query: string): number {
  const normalizedLabel = label.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 1;
  if (normalizedLabel === normalizedQuery) return 1000;
  if (normalizedLabel.startsWith(normalizedQuery)) return 700 - normalizedLabel.length;
  const substringIndex = normalizedLabel.indexOf(normalizedQuery);
  if (substringIndex >= 0) return 500 - substringIndex;

  let score = 0;
  let cursor = 0;
  for (const char of normalizedQuery) {
    const index = normalizedLabel.indexOf(char, cursor);
    if (index === -1) return 0;
    score += index === cursor ? 20 : 8;
    cursor = index + 1;
  }

  return score;
}

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: NavView) => void;
  onNewChat: () => void;
  onSwitchLanguage: () => void;
};

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  onNewChat,
  onSwitchLanguage,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(
    () => [
      {
        id: "today",
        label: t("commandPalette.openToday"),
        icon: LayoutDashboard,
        action: () => { onNavigate("today"); onClose(); },
      },
      {
        id: "new-chat",
        label: t("commandPalette.newChat"),
        icon: MessageSquare,
        action: () => { onNewChat(); onClose(); },
      },
      {
        id: "workspace",
        label: t("commandPalette.openWorkspace"),
        icon: FolderTree,
        action: () => { onNavigate("workspace"); onClose(); },
      },
      {
        id: "agents",
        label: t("commandPalette.createAgent"),
        icon: Bot,
        action: () => { onNavigate("agents"); onClose(); },
      },
      {
        id: "skills",
        label: t("commandPalette.createSkill"),
        icon: Zap,
        action: () => { onNavigate("skills"); onClose(); },
      },
      {
        id: "workflows",
        label: t("commandPalette.createWorkflow"),
        icon: GitBranch,
        action: () => { onNavigate("workflows"); onClose(); },
      },
      {
        id: "mcp",
        label: t("commandPalette.addMcp"),
        icon: Plug,
        action: () => { onNavigate("mcp"); onClose(); },
      },
      {
        id: "settings",
        label: t("commandPalette.openSettings"),
        icon: Settings,
        action: () => { onNavigate("settings"); onClose(); },
      },
      {
        id: "language",
        label: t("commandPalette.switchLanguage"),
        icon: Languages,
        action: () => { onSwitchLanguage(); onClose(); },
      },
    ],
    [t, onNavigate, onNewChat, onSwitchLanguage, onClose],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((command) => ({
        command,
        score: scoreCommand(command.label, query),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label))
      .map((entry) => entry.command);
  }, [query, commands]);

  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        filtered[selectedIdx].action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, filtered, selectedIdx]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 rounded-xl border border-border bg-bg-secondary shadow-2xl overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("commandPalette.placeholder")}
          className="w-full px-4 py-3 bg-transparent text-sm text-text-primary placeholder-text-secondary/50 outline-none border-b border-border"
        />
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.map((cmd, idx) => (
            <button
              key={cmd.id}
              onClick={cmd.action}
              className={`flex items-center gap-3 w-full px-4 py-2 text-xs cursor-pointer transition-colors ${
                idx === selectedIdx
                  ? "bg-white/8 text-text-primary"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              <cmd.icon size={14} className="shrink-0" />
              <span>{cmd.label}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-xs text-text-secondary">
              {t("common.noResults")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
