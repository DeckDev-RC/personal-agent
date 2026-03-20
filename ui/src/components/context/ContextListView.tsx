import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import type { ProjectContext } from "../../../../src/types/projectContext.js";
import { useContextStore } from "../../stores/contextStore";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import ProjectContextEditor from "./ProjectContextEditor";

export default function ContextListView() {
  const { t } = useTranslation();
  const { contexts, loaded, loadContexts, deleteContext } = useContextStore();
  const [editing, setEditing] = useState<ProjectContext | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loaded) {
      void loadContexts();
    }
  }, [loaded, loadContexts]);

  if (editing || creating) {
    return (
      <ProjectContextEditor
        projectContext={editing ?? undefined}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-text-primary">{t("contexts.title")}</h1>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} />
            {t("contexts.create")}
          </Button>
        </div>

        {contexts.length === 0 ? (
          <div className="text-center py-12 text-text-secondary text-sm">
            {t("contexts.noContexts")}
          </div>
        ) : (
          <div className="grid gap-3">
            {contexts.map((projectContext) => (
              <div
                key={projectContext.id}
                className="group flex items-start gap-4 rounded-xl border border-border bg-bg-secondary p-4 hover:border-white/10 transition-colors"
              >
                <div className="shrink-0 w-9 h-9 rounded-lg bg-accent-blue/10 text-accent-blue flex items-center justify-center mt-0.5">
                  <FolderOpen size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {projectContext.name}
                    </span>
                    <Badge color="blue">{projectContext.stakeholders.length} {t("contexts.countStakeholders")}</Badge>
                    <Badge color="gray">{projectContext.decisions.length} {t("contexts.countDecisions")}</Badge>
                    <Badge color="gray">{projectContext.links.length} {t("contexts.countLinks")}</Badge>
                  </div>
                  {projectContext.description && (
                    <p className="mt-1 text-xs text-text-secondary line-clamp-2">
                      {projectContext.description}
                    </p>
                  )}
                  {projectContext.notes && (
                    <p className="mt-1.5 text-[10px] text-text-secondary/50 line-clamp-3">
                      {projectContext.notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => setEditing(projectContext)}
                    className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteContext(projectContext.id)}
                    className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
