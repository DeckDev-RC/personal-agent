import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskRecord } from "../../../../src/types/task.js";
import Button from "../shared/Button";
import Input, { TextArea } from "../shared/Input";
import Modal from "../shared/Modal";
import Select from "../shared/Select";

const STATUS_OPTIONS = [
  { value: "backlog", labelKey: "tasks.status.backlog" },
  { value: "today", labelKey: "tasks.status.today" },
  { value: "in_progress", labelKey: "tasks.status.inProgress" },
  { value: "done", labelKey: "tasks.status.done" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", labelKey: "tasks.priority.low" },
  { value: "medium", labelKey: "tasks.priority.medium" },
  { value: "high", labelKey: "tasks.priority.high" },
] as const;

type TaskEditorProps = {
  open: boolean;
  task?: TaskRecord | null;
  contextOptions: Array<{ value: string; label: string }>;
  defaultProjectContextId?: string;
  onClose: () => void;
  onSave: (patch: Partial<TaskRecord>) => Promise<void>;
};

export default function TaskEditor({
  open,
  task,
  contextOptions,
  defaultProjectContextId,
  onClose,
  onSave,
}: TaskEditorProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskRecord["status"]>("backlog");
  const [priority, setPriority] = useState<TaskRecord["priority"]>("medium");
  const [projectContextId, setProjectContextId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "backlog");
    setPriority(task?.priority ?? "medium");
    setProjectContextId(task?.projectContextId ?? defaultProjectContextId ?? "");
    setDueDate(task?.dueDate ?? "");
  }, [defaultProjectContextId, open, task]);

  const normalized = useMemo(
    () => ({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      projectContextId,
      dueDate,
    }),
    [description, dueDate, priority, projectContextId, status, title],
  );

  async function handleSave() {
    if (!normalized.title) {
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: normalized.title,
        description: normalized.description,
        status: normalized.status,
        priority: normalized.priority,
        projectContextId: normalized.projectContextId || undefined,
        dueDate: normalized.dueDate || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? t("tasks.edit") : t("tasks.create")}
      width="max-w-2xl"
    >
      <div className="space-y-4">
        <Input
          label={t("tasks.name")}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("tasks.namePlaceholder")}
        />

        <TextArea
          label={t("tasks.description")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("tasks.descriptionPlaceholder")}
          className="min-h-28"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label={t("tasks.statusLabel")}
            value={status}
            onChange={(value) => setStatus(value as TaskRecord["status"])}
            options={STATUS_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
          />

          <Select
            label={t("tasks.priorityLabel")}
            value={priority}
            onChange={(value) => setPriority(value as TaskRecord["priority"])}
            options={PRIORITY_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label={t("tasks.projectContext")}
            value={projectContextId}
            onChange={setProjectContextId}
            options={contextOptions}
          />

          <Input
            type="date"
            label={t("tasks.dueDate")}
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={!normalized.title || saving}>
            {task ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
