import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCoworkStore } from "../../stores/coworkStore.js";
import BriefingCard from "./BriefingCard.js";
import CoworkQuickActions from "./CoworkQuickActions.js";
import MeetingCard from "./MeetingCard.js";
import ProjectCard from "./ProjectCard.js";
import Spinner from "../shared/Spinner.js";
import { setRoute } from "../../router.js";

export default function CoworkDashboard() {
  const { t } = useTranslation();
  const { snapshot, briefing, loading, loadSnapshot, loadBriefing } = useCoworkStore();

  useEffect(() => {
    void loadSnapshot();
    void loadBriefing();
  }, [loadSnapshot, loadBriefing]);

  if (loading && !snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-4">
          {briefing && <BriefingCard briefing={briefing} />}
          <CoworkQuickActions />

          {/* Recent files */}
          {snapshot && snapshot.recentFiles.length > 0 && (
            <div className="rounded-xl border border-border bg-bg-secondary p-4">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
                {t("cowork.dashboard.recentFiles", "Arquivos Recentes")}
              </p>
              <div className="space-y-1.5">
                {snapshot.recentFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-text-primary truncate">{file.title}</span>
                    <span className="text-text-secondary shrink-0 ml-2">{file.category}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Upcoming meetings */}
          {snapshot && snapshot.upcomingMeetings.length > 0 && (
            <div className="rounded-xl border border-border bg-bg-secondary p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  {t("cowork.dashboard.meetings", "Proximas Reunioes")}
                </p>
                <button
                  onClick={() => useCoworkStore.getState().setActiveTab("meetings")}
                  className="text-[10px] text-accent hover:underline cursor-pointer"
                >
                  {t("cowork.dashboard.viewAll", "Ver todas")}
                </button>
              </div>
              <div className="space-y-2">
                {snapshot.upcomingMeetings.slice(0, 3).map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} />
                ))}
              </div>
            </div>
          )}

          {/* Active projects */}
          {snapshot && snapshot.activeProjects.length > 0 && (
            <div className="rounded-xl border border-border bg-bg-secondary p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  {t("cowork.dashboard.projects", "Projetos Ativos")}
                </p>
                <button
                  onClick={() => useCoworkStore.getState().setActiveTab("projects")}
                  className="text-[10px] text-accent hover:underline cursor-pointer"
                >
                  {t("cowork.dashboard.viewAll", "Ver todas")}
                </button>
              </div>
              <div className="space-y-2">
                {snapshot.activeProjects.slice(0, 3).map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => setRoute("contexts")}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
