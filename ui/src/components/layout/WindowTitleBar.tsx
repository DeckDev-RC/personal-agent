import React from "react";
import { Minus, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function WindowTitleBar() {
  const { t } = useTranslation();

  function handleMinimize() {
    window.codexAgent?.minimizeWindow?.();
  }

  function handleToggleMaximize() {
    window.codexAgent?.toggleMaximizeWindow?.();
  }

  function handleClose() {
    window.codexAgent?.closeWindow?.();
  }

  return (
    <header
      className="app-drag-region flex h-10 shrink-0 items-center justify-between border-b border-border bg-bg-primary/95 px-3 backdrop-blur"
      onDoubleClick={handleToggleMaximize}
    >
      <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary">
        {t("app.name")}
      </div>

      <div className="app-no-drag flex items-center gap-1">
        <button
          onClick={handleMinimize}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
          title={t("common.minimize")}
          aria-label={t("common.minimize")}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
          title={t("common.maximizeWindow")}
          aria-label={t("common.maximizeWindow")}
        >
          <Square size={12} />
        </button>
        <button
          onClick={handleClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-red-500/15 hover:text-red-400"
          title={t("common.closeWindow")}
          aria-label={t("common.closeWindow")}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
