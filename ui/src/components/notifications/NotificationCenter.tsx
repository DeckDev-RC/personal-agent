import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, Clock3, RefreshCw, Trash2 } from "lucide-react";
import type { ReminderRecord } from "../../../../src/types/reminder.js";
import { useContextStore } from "../../stores/contextStore";
import { useNotificationStore } from "../../stores/notificationStore";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";

function buildDefaultTriggerAt(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  now.setSeconds(0, 0);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

function formatReminderTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function ReminderCard(props: {
  reminder: ReminderRecord;
  contextLabel?: string;
  highlight: boolean;
  onAcknowledge?: () => void;
  onCancel?: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { reminder, contextLabel, highlight, onAcknowledge, onCancel, onDelete } = props;
  const isPending = reminder.status === "pending";
  const isOverdue = isPending && reminder.triggerAt <= Date.now();

  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight
          ? "border-accent-orange/35 bg-accent-orange/10"
          : "border-border bg-bg-primary/80"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary">{reminder.message}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary/65">
            <span>{formatReminderTime(reminder.triggerAt)}</span>
            {contextLabel && <Badge color="gray">{contextLabel}</Badge>}
            {reminder.recurring !== "none" && (
              <Badge color="blue">
                {t(`notifications.recurrence.${reminder.recurring}`)}
              </Badge>
            )}
            {isOverdue && <Badge color="orange">{t("notifications.overdue")}</Badge>}
          </div>
        </div>

        <Badge color={isPending ? "blue" : reminder.status === "delivered" ? "green" : "gray"}>
          {t(`notifications.status.${reminder.status}`)}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {onAcknowledge && (
          <Button variant="primary" size="sm" onClick={onAcknowledge}>
            {t("notifications.markRead")}
          </Button>
        )}
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("notifications.cancelReminder")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 size={14} />
          {t("notifications.deleteReminder")}
        </Button>
      </div>
    </div>
  );
}

export default function NotificationCenter() {
  const { t } = useTranslation();
  const {
    reminders,
    loaded,
    loading,
    error,
    lastTriggeredReminderId,
    loadReminders,
    createReminder,
    acknowledgeReminder,
    cancelReminder,
    deleteReminder,
    startEventBridge,
  } = useNotificationStore();
  const { contexts, loaded: contextsLoaded, loadContexts, activeContextId } = useContextStore();

  const [message, setMessage] = useState("");
  const [triggerAt, setTriggerAt] = useState(buildDefaultTriggerAt);
  const [recurring, setRecurring] = useState<ReminderRecord["recurring"]>("none");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loaded && !loading) {
      void loadReminders();
    }
  }, [loaded, loading, loadReminders]);

  useEffect(() => {
    startEventBridge();
  }, [startEventBridge]);

  useEffect(() => {
    if (!contextsLoaded) {
      void loadContexts();
    }
  }, [contextsLoaded, loadContexts]);

  const contextLabels = useMemo(
    () =>
      Object.fromEntries(
        contexts.map((projectContext) => [projectContext.id, projectContext.name]),
      ) as Record<string, string>,
    [contexts],
  );

  const pendingReminders = reminders.filter((reminder) => reminder.status === "pending");
  const historyReminders = reminders.filter((reminder) => reminder.status !== "pending");

  async function handleCreateReminder() {
    const normalizedMessage = message.trim();
    const normalizedTriggerAt = triggerAt.trim();
    if (!normalizedMessage || !normalizedTriggerAt || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await createReminder({
        message: normalizedMessage,
        triggerAt: normalizedTriggerAt,
        recurring,
        projectContextId: activeContextId || undefined,
      });
      setMessage("");
      setTriggerAt(buildDefaultTriggerAt());
      setRecurring("none");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <BellRing size={18} className="text-accent-orange" />
                {t("notifications.title")}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-text-secondary/75">
                {t("notifications.subtitle")}
              </p>
            </div>

            <Button variant="secondary" size="sm" onClick={() => void loadReminders()}>
              <RefreshCw size={14} />
              {t("notifications.refresh")}
            </Button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.2fr),minmax(280px,0.8fr)]">
            <div className="rounded-2xl border border-border bg-bg-primary/80 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Clock3 size={16} className="text-accent-blue" />
                {t("notifications.createTitle")}
              </div>
              <p className="mt-1 text-xs text-text-secondary/70">
                {t("notifications.createDescription")}
              </p>

              <div className="mt-4 grid gap-3">
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={t("notifications.messagePlaceholder")}
                  className="w-full rounded-xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-accent-blue/40"
                />

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px]">
                  <input
                    type="datetime-local"
                    value={triggerAt}
                    onChange={(event) => setTriggerAt(event.target.value)}
                    className="w-full rounded-xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-accent-blue/40"
                  />

                  <select
                    value={recurring}
                    onChange={(event) => setRecurring(event.target.value as ReminderRecord["recurring"])}
                    className="w-full rounded-xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-accent-blue/40"
                  >
                    <option value="none">{t("notifications.recurrence.none")}</option>
                    <option value="daily">{t("notifications.recurrence.daily")}</option>
                    <option value="weekly">{t("notifications.recurrence.weekly")}</option>
                    <option value="weekdays">{t("notifications.recurrence.weekdays")}</option>
                  </select>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleCreateReminder()}
                    disabled={!message.trim() || !triggerAt.trim() || submitting}
                  >
                    {t("notifications.create")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
                  {t("notifications.stats.pending")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">{pendingReminders.length}</div>
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
                  {t("notifications.stats.unread")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">
                  {historyReminders.filter((reminder) => reminder.status === "delivered").length}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
                  {t("notifications.stats.history")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">{historyReminders.length}</div>
              </div>
            </div>
          </div>
        </section>

        {error && !loading && reminders.length === 0 ? (
          <EmptyState
            icon={<BellRing size={18} />}
            title={t("notifications.errorTitle")}
            description={error}
            action={{
              label: t("notifications.refresh"),
              onClick: () => void loadReminders(),
            }}
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr),minmax(0,0.95fr)]">
            <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <BellRing size={16} className="text-accent-blue" />
                {t("notifications.pendingTitle")}
              </div>
              <p className="mt-1 text-xs text-text-secondary/70">
                {t("notifications.pendingDescription")}
              </p>

              {pendingReminders.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<Clock3 size={18} />}
                    title={t("notifications.pendingEmptyTitle")}
                    description={t("notifications.pendingEmptyDescription")}
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {pendingReminders.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      contextLabel={
                        reminder.projectContextId
                          ? contextLabels[reminder.projectContextId]
                          : undefined
                      }
                      highlight={reminder.id === lastTriggeredReminderId}
                      onCancel={() => void cancelReminder(reminder.id)}
                      onDelete={() => void deleteReminder(reminder.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Clock3 size={16} className="text-accent-green" />
                {t("notifications.historyTitle")}
              </div>
              <p className="mt-1 text-xs text-text-secondary/70">
                {t("notifications.historyDescription")}
              </p>

              {historyReminders.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<BellRing size={18} />}
                    title={t("notifications.historyEmptyTitle")}
                    description={t("notifications.historyEmptyDescription")}
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {historyReminders.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      contextLabel={
                        reminder.projectContextId
                          ? contextLabels[reminder.projectContextId]
                          : undefined
                      }
                      highlight={reminder.id === lastTriggeredReminderId}
                      onAcknowledge={
                        reminder.status === "delivered"
                          ? () => void acknowledgeReminder(reminder.id)
                          : undefined
                      }
                      onDelete={() => void deleteReminder(reminder.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
