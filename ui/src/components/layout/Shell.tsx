import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Minus, X } from "lucide-react";
import Sidebar, { type NavView } from "./Sidebar";
import CommandPalette from "./CommandPalette";
import ChatView from "../chat/ChatView";
import AgentListView from "../agents/AgentListView";
import SkillListView from "../skills/SkillListView";
import McpListView from "../mcp/McpListView";
import WorkflowListView from "../workflows/WorkflowListView";
import SettingsView from "../settings/SettingsView";
import UsageView from "../analytics/UsageView";
import LogsView from "../analytics/LogsView";
import StatusBar from "./StatusBar";
import { useSettingsStore } from "../../stores/settingsStore";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { useHashRouter, setRoute } from "../../router";

export default function Shell() {
  const { t, i18n } = useTranslation();
  const { view: routeView, param: routeParam, navigate: routeNavigate } = useHashRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const activeView = routeView as NavView;
  const setActiveView = (v: NavView) => routeNavigate(v);

  const { loadSettings, settings } = useSettingsStore();
  const { loadConversations } = useChatStore();
  const { checkAuth } = useAuthStore();

  // Load initial data
  useEffect(() => {
    void (async () => {
      await loadSettings();
      await loadConversations();
      await checkAuth(useSettingsStore.getState().settings.defaultModelRef);
    })();
  }, []);

  useEffect(() => {
    void checkAuth(settings.defaultModelRef);
  }, [checkAuth, settings.defaultModelRef]);

  // Sync language
  useEffect(() => {
    if (settings.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings.language]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveView("chat");
    const store = useChatStore.getState();
    store.createConversation(settings.defaultModelRef, "");
  }, [settings.defaultModelRef]);

  const handleSwitchLanguage = useCallback(() => {
    const langs = ["pt-BR", "en", "es", "de", "zh-CN", "zh-TW"] as const;
    const idx = langs.indexOf(settings.language as any);
    const next = langs[(idx + 1) % langs.length];
    useSettingsStore.getState().updateSettings({ language: next });
  }, [settings.language]);

  function renderView() {
    switch (activeView) {
      case "chat":
        return <ChatView />;
      case "settings":
        return <SettingsView />;
      case "agents":
        return <AgentListView />;
      case "skills":
        return <SkillListView />;
      case "workflows":
        return <WorkflowListView />;
      case "mcp":
        return <McpListView />;
      case "analytics":
        return <UsageView />;
      case "logs":
        return <LogsView />;
    }
  }

  function handleMinimize() {
    (window as any).codexAgent?.minimizeWindow?.();
  }

  function handleClose() {
    (window as any).codexAgent?.closeWindow?.();
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary text-text-primary select-none">
      <div className="absolute top-0 left-0 right-0 h-8 app-drag-region z-20 flex items-center justify-between border-b border-border bg-bg-primary/95 px-3 backdrop-blur">
        <div className="text-[11px] tracking-[0.08em] text-text-secondary uppercase">
          {t("app.name")}
        </div>
        <div className="app-no-drag flex items-center gap-1">
          <button
            onClick={handleMinimize}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors cursor-pointer"
            title={t("common.minimize")}
            aria-label={t("common.minimize")}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-red-500/15 hover:text-red-400 transition-colors cursor-pointer"
            title={t("common.closeWindow")}
            aria-label={t("common.closeWindow")}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        activeView={activeView}
        onNavigate={setActiveView}
      />

      <main className="flex-1 flex flex-col min-w-0 pt-8">
        <StatusBar />
        {renderView()}
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(v) => setActiveView(v)}
        onNewChat={handleNewChat}
        onSwitchLanguage={handleSwitchLanguage}
      />
    </div>
  );
}
