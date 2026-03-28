import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Calendar, FolderOpen, Mail, Target } from "lucide-react";
import { useCoworkStore } from "../../stores/coworkStore.js";
import { useTaskStore } from "../../stores/taskStore.js";
import type { CoworkTab } from "../../../../src/types/cowork.js";
import CoworkDashboard from "./CoworkDashboard.js";
import CoworkMeetings from "./CoworkMeetings.js";
import CoworkProjects from "./CoworkProjects.js";
import CoworkCommunications from "./CoworkCommunications.js";
import CoworkFocus from "./CoworkFocus.js";

type TabDef = {
  id: CoworkTab;
  icon: React.ElementType;
  labelKey: string;
  fallback: string;
};

const TABS: TabDef[] = [
  { id: "dashboard", icon: LayoutDashboard, labelKey: "cowork.tab.dashboard", fallback: "Dashboard" },
  { id: "meetings", icon: Calendar, labelKey: "cowork.tab.meetings", fallback: "Reunioes" },
  { id: "projects", icon: FolderOpen, labelKey: "cowork.tab.projects", fallback: "Projetos" },
  { id: "communications", icon: Mail, labelKey: "cowork.tab.communications", fallback: "Comunicacao" },
  { id: "focus", icon: Target, labelKey: "cowork.tab.focus", fallback: "Foco" },
];

export default function CoworkView() {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, focusActive } = useCoworkStore();
  const { loadTasks } = useTaskStore();

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // In focus mode, hide the tab bar for a cleaner experience
  if (focusActive && activeTab === "focus") {
    return (
      <div className="flex flex-1 flex-col relative">
        <CoworkFocus />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border px-4 pt-2 shrink-0 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <Icon size={14} />
              {t(tab.labelKey, tab.fallback)}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      <div className="flex flex-1 flex-col min-h-0">
        {activeTab === "dashboard" && <CoworkDashboard />}
        {activeTab === "meetings" && <CoworkMeetings />}
        {activeTab === "projects" && <CoworkProjects />}
        {activeTab === "communications" && <CoworkCommunications />}
        {activeTab === "focus" && <CoworkFocus />}
      </div>
    </div>
  );
}
