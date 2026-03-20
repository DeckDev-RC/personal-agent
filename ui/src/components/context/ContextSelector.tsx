import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, FolderOpen } from "lucide-react";
import { useContextStore } from "../../stores/contextStore";

type ContextSelectorProps = {
  selectedContextId: string;
  onSelect: (contextId: string) => void;
};

export default function ContextSelector({
  selectedContextId,
  onSelect,
}: ContextSelectorProps) {
  const { t } = useTranslation();
  const { contexts, loaded, loadContexts } = useContextStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loaded) {
      void loadContexts();
    }
  }, [loaded, loadContexts]);

  const selectedContext = contexts.find((projectContext) => projectContext.id === selectedContextId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/5 border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-white/8 transition-colors cursor-pointer"
      >
        <FolderOpen size={12} className="text-accent-blue" />
        <span className="truncate max-w-[160px]">
          {selectedContext?.name ?? t("contexts.none")}
        </span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 w-72 rounded-xl border border-border bg-bg-secondary shadow-xl overflow-hidden">
            <button
              onClick={() => {
                onSelect("");
                setOpen(false);
              }}
              className={`flex items-center gap-2 w-full px-3 py-3 text-xs cursor-pointer transition-colors ${
                !selectedContextId
                  ? "bg-white/8 text-text-primary"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              <FolderOpen size={12} className="text-accent-blue shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate">{t("contexts.none")}</div>
                <div className="truncate text-[10px] text-text-secondary/50 mt-0.5">
                  {t("contexts.noneDescription")}
                </div>
              </div>
            </button>

            {contexts.map((projectContext) => (
              <button
                key={projectContext.id}
                onClick={() => {
                  onSelect(projectContext.id);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-3 text-xs cursor-pointer transition-colors ${
                  projectContext.id === selectedContextId
                    ? "bg-white/8 text-text-primary"
                    : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                }`}
              >
                <FolderOpen size={12} className="text-accent-blue shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate">{projectContext.name}</div>
                  <div className="truncate text-[10px] text-text-secondary/50 mt-0.5">
                    {projectContext.description || t("contexts.emptyDescription")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
