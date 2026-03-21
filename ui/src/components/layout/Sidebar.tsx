import React, { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  BellRing,
  LayoutDashboard,
  MessageSquare,
  Search,
  FolderTree,
  FileStack,
  Bot,
  FolderOpen,
  ListTodo,
  Zap,
  GitBranch,
  Globe,
  Plug,
  Settings,
  PanelLeftClose,
  PanelLeft,
  X,
  BarChart3,
  ScrollText,
  Mail,
} from "lucide-react";
import QuickActions from "../skills/QuickActions";

export type NavView =
  | "today"
  | "chat"
  | "notifications"
  | "browser"
  | "workspace"
  | "documents"
  | "knowledge"
  | "agents"
  | "contexts"
  | "tasks"
  | "skills"
  | "workflows"
  | "mcp"
  | "analytics"
  | "logs"
  | "settings"
  | "communication";

type SidebarProps = {
  open: boolean;
  onToggle: () => void;
  activeView: NavView;
  onNavigate: (view: NavView) => void;
};

type NavItem = { view: NavView; icon: React.ElementType; labelKey: string; fallbackLabel: string };

const chatItems: NavItem[] = [
  { view: "today", icon: LayoutDashboard, labelKey: "nav.today", fallbackLabel: "Hoje" },
  { view: "chat", icon: MessageSquare, labelKey: "nav.chat", fallbackLabel: "Chat" },
  { view: "notifications", icon: BellRing, labelKey: "nav.notifications", fallbackLabel: "Notificacoes" },
];

const managementItems: NavItem[] = [
  { view: "workspace", icon: FolderTree, labelKey: "nav.workspace", fallbackLabel: "Workspace" },
  { view: "browser", icon: Globe, labelKey: "nav.browser", fallbackLabel: "Browser" },
  { view: "documents", icon: FileStack, labelKey: "nav.documents", fallbackLabel: "Documentos" },
  { view: "knowledge", icon: Search, labelKey: "nav.knowledge", fallbackLabel: "Conhecimento" },
  { view: "agents", icon: Bot, labelKey: "nav.agents", fallbackLabel: "Agentes" },
  { view: "contexts", icon: FolderOpen, labelKey: "nav.contexts", fallbackLabel: "Contextos" },
  { view: "tasks", icon: ListTodo, labelKey: "nav.tasks", fallbackLabel: "Tarefas" },
  { view: "skills", icon: Zap, labelKey: "nav.skills", fallbackLabel: "Skills" },
  { view: "workflows", icon: GitBranch, labelKey: "nav.workflows", fallbackLabel: "Workflows" },
  { view: "communication", icon: Mail, labelKey: "nav.communication", fallbackLabel: "Comunicação" },
  { view: "mcp", icon: Plug, labelKey: "nav.mcp", fallbackLabel: "MCPs" },
  { view: "analytics", icon: BarChart3, labelKey: "nav.analytics", fallbackLabel: "Analytics" },
  { view: "logs", icon: ScrollText, labelKey: "nav.logs", fallbackLabel: "Logs" },
];

const allNavItems: NavItem[] = [...chatItems, ...managementItems];

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : true
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

function SectionLabel({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="text-[9px] uppercase tracking-wider text-text-secondary/50 px-2 pt-3 pb-0.5 select-none">
      {label}
    </span>
  );
}

export default function Sidebar({ open, onToggle, activeView, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Close drawer on Escape (mobile only)
  useEffect(() => {
    if (isDesktop || !open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDesktop, open, onToggle]);

  const handleNavigate = useCallback(
    (view: NavView) => {
      onNavigate(view);
      // Auto-close on mobile when a nav item is clicked
      if (!isDesktop && open) onToggle();
    },
    [isDesktop, open, onToggle, onNavigate]
  );

  const renderNavButton = (item: NavItem) => {
    const { view, icon: Icon, labelKey, fallbackLabel } = item;
    const active = activeView === view;
    const showLabel = open || !isDesktop;
    return (
      <button
        key={view}
        onClick={() => handleNavigate(view)}
        className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
          active
            ? "bg-white/10 text-text-primary"
            : "text-text-secondary hover:text-text-primary hover:bg-white/5"
        }`}
        title={!open && isDesktop ? t(labelKey, fallbackLabel) : undefined}
      >
        <Icon size={16} className="shrink-0" />
        {showLabel && <span>{t(labelKey, fallbackLabel)}</span>}
      </button>
    );
  };

  const showLabels = open || !isDesktop;

  const sidebarContent = (
    <div
      className={`flex flex-col h-full bg-bg-secondary ${
        isDesktop
          ? `border-r border-border transition-all duration-200 ${open ? "w-48" : "w-12"}`
          : "w-64"
      }`}
    >
      {/* Toggle / Close */}
      <div className="flex items-center justify-between h-10 border-b border-border px-2">
        {isDesktop ? (
          <button
            onClick={onToggle}
            className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-1 mx-auto"
          >
            {open ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>
        ) : (
          <>
            <span className="text-[11px] uppercase tracking-wider text-text-secondary font-medium">
              {t("app.name")}
            </span>
            <button
              onClick={onToggle}
              className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-1"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>

      {/* Nav items */}
      <nav aria-label="Navigation" className="flex-1 py-2 flex flex-col gap-0.5 px-1.5 overflow-y-auto">
        {/* Chat section */}
        <SectionLabel label="Chat" visible={showLabels} />
        {chatItems.map(renderNavButton)}

        {showLabels && (
          <QuickActions
            onAction={() => {
              if (!isDesktop && open) onToggle();
            }}
          />
        )}

        {/* Management section */}
        <SectionLabel label="Management" visible={showLabels} />
        {managementItems.map(renderNavButton)}
      </nav>

      {/* Settings at bottom — System section */}
      <div className="px-1.5 pb-2 flex flex-col gap-0.5">
        <SectionLabel label="System" visible={showLabels} />
        <button
          onClick={() => handleNavigate("settings")}
          className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer w-full ${
            activeView === "settings"
              ? "bg-white/10 text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-white/5"
          }`}
          title={!open && isDesktop ? t("nav.settings", "Config") : undefined}
        >
          <Settings size={16} className="shrink-0" />
          {(open || !isDesktop) && <span>{t("nav.settings", "Config")}</span>}
        </button>
      </div>
    </div>
  );

  // Desktop: inline collapsible sidebar
  if (isDesktop) {
    return sidebarContent;
  }

  // Mobile / Tablet: slide-over drawer with backdrop
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onToggle}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}
