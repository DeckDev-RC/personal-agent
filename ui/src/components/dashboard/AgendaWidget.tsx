import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, CheckCircle2, Clock3, Plus, Trash2 } from "lucide-react";
import type { DashboardManualAgendaItem } from "../../stores/dashboardStore";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";

type AgendaWidgetProps = {
  items: DashboardManualAgendaItem[];
  calendarConnected: boolean;
  onAdd: (title: string, timeLabel: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
};

function sortAgendaItems(items: DashboardManualAgendaItem[]): DashboardManualAgendaItem[] {
  return [...items].sort((left, right) => {
    if (left.done !== right.done) {
      return left.done ? 1 : -1;
    }
    if (left.timeLabel && right.timeLabel) {
      return left.timeLabel.localeCompare(right.timeLabel);
    }
    if (left.timeLabel) {
      return -1;
    }
    if (right.timeLabel) {
      return 1;
    }
    return left.createdAt - right.createdAt;
  });
}

export default function AgendaWidget({
  items,
  calendarConnected,
  onAdd,
  onToggle,
  onRemove,
}: AgendaWidgetProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [timeLabel, setTimeLabel] = useState("");

  const orderedItems = useMemo(() => sortAgendaItems(items), [items]);

  function handleSubmit() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return;
    }
    onAdd(normalizedTitle, timeLabel.trim());
    setTitle("");
    setTimeLabel("");
  }

  return (
    <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <CalendarRange size={16} className="text-accent-blue" />
            {t("dashboard.agenda.title")}
          </div>
          <p className="mt-1 text-xs text-text-secondary/70">
            {t("dashboard.agenda.description")}
          </p>
        </div>
        <Badge color={calendarConnected ? "green" : "gray"}>
          {calendarConnected
            ? t("dashboard.agenda.calendarConnected")
            : t("dashboard.agenda.calendarDisconnected")}
        </Badge>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-bg-primary/80 px-4 py-3 text-xs text-text-secondary/75">
        {calendarConnected
          ? t("dashboard.agenda.calendarConnectedHint")
          : t("dashboard.agenda.calendarDisconnectedHint")}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-[120px,minmax(0,1fr),auto]">
        <input
          value={timeLabel}
          onChange={(event) => setTimeLabel(event.target.value)}
          placeholder={t("dashboard.agenda.timePlaceholder")}
          className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-blue/40"
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={t("dashboard.agenda.itemPlaceholder")}
          className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-blue/40"
        />
        <Button variant="primary" size="sm" onClick={handleSubmit}>
          <Plus size={14} />
          {t("dashboard.agenda.add")}
        </Button>
      </div>

      {orderedItems.length === 0 ? (
        <EmptyState
          icon={<Clock3 size={18} />}
          title={t("dashboard.agenda.emptyTitle")}
          description={t("dashboard.agenda.emptyDescription")}
        />
      ) : (
        <div className="mt-4 space-y-2">
          {orderedItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                item.done
                  ? "border-border bg-bg-primary/60 opacity-70"
                  : "border-border bg-bg-primary"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  item.done
                    ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
                    : "border-border bg-bg-secondary text-text-secondary hover:text-text-primary"
                }`}
                aria-label={t("dashboard.agenda.done")}
              >
                <CheckCircle2 size={15} />
              </button>

              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm ${
                    item.done ? "text-text-secondary line-through" : "text-text-primary"
                  }`}
                >
                  {item.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary/60">
                  {item.timeLabel ? (
                    <Badge color="blue">{item.timeLabel}</Badge>
                  ) : (
                    <span>{t("dashboard.tasks.noDueDate")}</span>
                  )}
                  {item.done && <Badge color="green">{t("dashboard.agenda.done")}</Badge>}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
                aria-label={t("dashboard.agenda.remove")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
