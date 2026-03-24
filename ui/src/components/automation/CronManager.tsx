import React, { useEffect, useState, useCallback } from "react";
import { Clock, Play, Pause, Trash2, Plus, Settings } from "lucide-react";

type CronActionType = "workflow" | "skill" | "send_draft" | "http_fetch" | "custom_prompt";

type CronJob = {
  id: string;
  name: string;
  cronExpr: string;
  actionType: CronActionType;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

const api = () => (window as any).codexAgent;

const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: "Every 30 minutes", expr: "*/30 * * * *" },
  { label: "Every hour", expr: "0 * * * *" },
  { label: "Daily at 8am", expr: "0 8 * * *" },
  { label: "Every Monday", expr: "0 9 * * 1" },
];

const ACTION_TYPES: { value: CronActionType; label: string }[] = [
  { value: "workflow", label: "Workflow" },
  { value: "skill", label: "Skill" },
  { value: "send_draft", label: "Send Draft" },
  { value: "http_fetch", label: "HTTP Fetch" },
  { value: "custom_prompt", label: "Custom Prompt" },
];

function formatTime(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function CronJobForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CronJob;
  onSave: (data: { name: string; cronExpr: string; actionType: CronActionType; actionConfig: Record<string, unknown> }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cronExpr, setCronExpr] = useState(initial?.cronExpr ?? "0 * * * *");
  const [actionType, setActionType] = useState<CronActionType>(initial?.actionType ?? "workflow");
  const [actionConfigStr, setActionConfigStr] = useState(
    initial ? JSON.stringify(initial.actionConfig, null, 2) : "{}",
  );
  const [jsonError, setJsonError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const actionConfig = JSON.parse(actionConfigStr);
      setJsonError("");
      onSave({ name, cronExpr, actionType, actionConfig });
    } catch {
      setJsonError("Invalid JSON");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-100">
        <Settings size={16} />
        <span>{initial ? "Edit Job" : "New Cron Job"}</span>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          placeholder="My scheduled job"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Cron Expression</label>
        <input
          type="text"
          value={cronExpr}
          onChange={(e) => setCronExpr(e.target.value)}
          required
          className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 font-mono focus:outline-none focus:border-blue-500"
          placeholder="*/30 * * * *"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.expr}
              type="button"
              onClick={() => setCronExpr(preset.expr)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                cronExpr === preset.expr
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Action Type</label>
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as CronActionType)}
          className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          {ACTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Action Config (JSON)</label>
        <textarea
          value={actionConfigStr}
          onChange={(e) => {
            setActionConfigStr(e.target.value);
            setJsonError("");
          }}
          rows={4}
          className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 font-mono focus:outline-none focus:border-blue-500 resize-y"
        />
        {jsonError && <p className="text-red-400 text-xs mt-1">{jsonError}</p>}
      </div>

      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
        >
          {initial ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}

export default function CronManager() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | undefined>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const list = await api().cron.list();
      setJobs(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Failed to load cron jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function handleCreate(data: { name: string; cronExpr: string; actionType: CronActionType; actionConfig: Record<string, unknown> }) {
    await api().cron.create(data);
    setShowForm(false);
    await loadJobs();
  }

  async function handleUpdate(data: { name: string; cronExpr: string; actionType: CronActionType; actionConfig: Record<string, unknown> }) {
    if (!editingJob) return;
    await api().cron.update(editingJob.id, data);
    setEditingJob(undefined);
    setShowForm(false);
    await loadJobs();
  }

  async function handleToggle(id: string, enabled: boolean) {
    await api().cron.toggle(id, enabled);
    await loadJobs();
  }

  async function handleDelete(id: string) {
    await api().cron.delete(id);
    setDeleteConfirmId(null);
    await loadJobs();
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Loading scheduled tasks...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-blue-400" />
          <h2 className="text-base font-semibold text-gray-100">Scheduled Tasks</h2>
          <span className="text-xs text-gray-500">({jobs.length})</span>
        </div>
        <button
          onClick={() => {
            setEditingJob(undefined);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
        >
          <Plus size={14} />
          New Job
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <CronJobForm
          initial={editingJob}
          onSave={editingJob ? handleUpdate : handleCreate}
          onCancel={() => {
            setShowForm(false);
            setEditingJob(undefined);
          }}
        />
      )}

      {/* Job list */}
      {jobs.length === 0 && !showForm ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          No scheduled tasks yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`rounded-lg border p-3 transition-colors ${
                job.enabled
                  ? "bg-gray-800 border-gray-700"
                  : "bg-gray-900 border-gray-800 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-100 truncate">{job.name}</span>
                    <code className="text-[11px] px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-gray-400 font-mono">
                      {job.cronExpr}
                    </code>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 uppercase">
                      {job.actionType.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500">
                    <span>Runs: {job.runCount}</span>
                    <span>Next: {formatTime(job.nextRun)}</span>
                    <span>Last: {formatTime(job.lastRun)}</span>
                    {job.lastError && (
                      <span className="text-red-400 truncate max-w-[200px]" title={job.lastError}>
                        Error: {job.lastError}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggle(job.id, !job.enabled)}
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                      job.enabled
                        ? "text-green-400 hover:bg-green-400/10"
                        : "text-gray-500 hover:bg-gray-700"
                    }`}
                    title={job.enabled ? "Pause" : "Resume"}
                  >
                    {job.enabled ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => {
                      setEditingJob(job);
                      setShowForm(true);
                    }}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Settings size={14} />
                  </button>
                  {deleteConfirmId === job.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="px-2 py-1 text-[11px] rounded bg-red-600 text-white hover:bg-red-500 transition-colors cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-2 py-1 text-[11px] rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(job.id)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
