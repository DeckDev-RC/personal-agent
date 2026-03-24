import React, { Suspense, lazy, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Sidebar, { type NavView } from "./Sidebar";
import CommandPalette from "./CommandPalette";
import DayView from "../dashboard/DayView";
import StatusBar from "./StatusBar";
import Spinner from "../shared/Spinner";
import WindowTitleBar from "./WindowTitleBar";
import { useSettingsStore } from "../../stores/settingsStore";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { useContextStore } from "../../stores/contextStore";
import { useRuntimeStore } from "../../stores/runtimeStore";
import { useHashRouter } from "../../router";

const ChatView = lazy(() => import("../chat/ChatView"));
const NotificationCenter = lazy(() => import("../notifications/NotificationCenter"));
const UnifiedInbox = lazy(() => import("../communication/UnifiedInbox"));
const AgentListView = lazy(() => import("../agents/AgentListView"));
const ContextListView = lazy(() => import("../context/ContextListView"));
const TasksView = lazy(() => import("../tasks/TasksView"));
const SkillListView = lazy(() => import("../skills/SkillListView"));
const McpListView = lazy(() => import("../mcp/McpListView"));
const WorkspaceExplorer = lazy(() => import("../workspace/WorkspaceExplorer"));
const WorkflowListView = lazy(() => import("../workflows/WorkflowListView"));
const DocumentsView = lazy(() => import("../documents/DocumentsView"));
const SearchView = lazy(() => import("../knowledge/SearchView"));
const RecipeList = lazy(() => import("../browser/RecipeList"));
const SettingsView = lazy(() => import("../settings/SettingsView"));
const UsageView = lazy(() => import("../analytics/UsageView"));
const LogsView = lazy(() => import("../analytics/LogsView"));
const DraftsList = lazy(() => import("../communication/DraftsList"));
const AutomationView = lazy(() => import("../automation/AutomationView"));
const PluginManager = lazy(() => import("../plugins/PluginManager"));

function ViewFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

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
  const refreshStatus = useRuntimeStore((state) => state.refreshStatus);

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

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, settings.contextWindow, settings.defaultModelRef, settings.maxOutputTokens]);

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
    store.createConversation(settings.defaultModelRef, "", undefined, useContextStore.getState().activeContextId || undefined);
  }, [settings.defaultModelRef]);

  const handleSwitchLanguage = useCallback(() => {
    const langs = ["pt-BR", "en", "es", "de", "zh-CN", "zh-TW"] as const;
    const idx = langs.indexOf(settings.language as any);
    const next = langs[(idx + 1) % langs.length];
    useSettingsStore.getState().updateSettings({ language: next });
  }, [settings.language]);

  function renderView() {
    switch (activeView) {
      case "today":
        return <DayView />;
      case "chat":
        return <ChatView sessionId={routeParam} />;
      case "notifications":
        return <NotificationCenter />;
      case "inbox":
        return <UnifiedInbox />;
      case "settings":
        return <SettingsView />;
      case "workspace":
        return <WorkspaceExplorer initialSelectedPath={routeParam ? decodeURIComponent(routeParam) : undefined} />;
      case "browser":
        return <RecipeList />;
      case "documents":
        return <DocumentsView />;
      case "knowledge":
        return <SearchView />;
      case "agents":
        return <AgentListView />;
      case "contexts":
        return <ContextListView />;
      case "tasks":
        return <TasksView />;
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
      case "communication":
        return <DraftsList />;
      case "automation":
        return <AutomationView />;
      case "plugins":
        return <PluginManager />;
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-primary text-text-primary select-none">
      <WindowTitleBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          activeView={activeView}
          onNavigate={setActiveView}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <StatusBar />
          <Suspense fallback={<ViewFallback />}>
            {renderView()}
          </Suspense>
        </main>
      </div>

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
