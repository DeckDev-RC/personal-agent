import React, { useMemo, useState } from "react";
import {
  AlarmClock,
  CalendarRange,
  ClipboardCheck,
  Inbox,
  Play,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { describeWorkflowSchedule } from "../../../../src/workflowSchedule.js";
import type { Workflow } from "../../stores/workflowStore";
import Badge from "../shared/Badge";
import Button from "../shared/Button";

const TEMPLATE_ORDER = [
  "cowork-morning-briefing",
  "cowork-end-of-day-report",
  "cowork-weekly-review",
  "cowork-inbox-triage",
  "cowork-meeting-prep",
] as const;

type TemplateMeta = {
  icon: LucideIcon;
  accent: "blue" | "green" | "orange" | "gray";
  spotlight: string;
  helper: string;
};

const TEMPLATE_META: Record<(typeof TEMPLATE_ORDER)[number], TemplateMeta> = {
  "cowork-morning-briefing": {
    icon: AlarmClock,
    accent: "blue",
    spotlight: "Start the day",
    helper: "Pull tasks, memory, and connected work tools into a single morning brief.",
  },
  "cowork-end-of-day-report": {
    icon: ClipboardCheck,
    accent: "green",
    spotlight: "Close the day",
    helper: "Capture progress, decisions, blockers, and the best next move for tomorrow.",
  },
  "cowork-weekly-review": {
    icon: CalendarRange,
    accent: "orange",
    spotlight: "Weekly cadence",
    helper: "Aggregate the week into a review that is useful for planning and reporting.",
  },
  "cowork-inbox-triage": {
    icon: Inbox,
    accent: "gray",
    spotlight: "Inbox control",
    helper: "Sort urgency, surface waiting threads, and suggest the next replies.",
  },
  "cowork-meeting-prep": {
    icon: Sparkles,
    accent: "blue",
    spotlight: "Meeting prep",
    helper: "Assemble a focused brief with context, risks, and talking points.",
  },
};

function workflowOrder(id: string): number {
  const index = TEMPLATE_ORDER.indexOf(id as (typeof TEMPLATE_ORDER)[number]);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function readWorkflowSignals(workflow: Workflow): string[] {
  const labels = new Set<string>();

  for (const step of workflow.steps) {
    if (step.type === "tool-call") labels.add("Tools");
    if (step.type === "memory-query") labels.add("Memory");
    if (step.type === "agent-chat") labels.add("Agent");
    if (step.type === "skill-execute") labels.add("Skill");
    if (step.type === "reindex-workspace") labels.add("Workspace");
  }

  if (workflow.schedule?.enabled !== undefined) {
    labels.add("Schedule-ready");
  }

  return Array.from(labels).slice(0, 4);
}

type WorkflowTemplatesProps = {
  workflows: Workflow[];
  runningWorkflowId?: string;
  onRun: (workflowId: string) => Promise<void> | void;
  onCustomize: (workflow: Workflow) => Promise<void> | void;
};

export default function WorkflowTemplates({
  workflows,
  runningWorkflowId,
  onRun,
  onCustomize,
}: WorkflowTemplatesProps) {
  const [busyAction, setBusyAction] = useState<{
    workflowId: string;
    kind: "run" | "customize";
  } | null>(null);

  const templates = useMemo(
    () =>
      workflows
        .filter((workflow) => workflow.id in TEMPLATE_META)
        .sort((left, right) => workflowOrder(left.id) - workflowOrder(right.id)),
    [workflows],
  );

  if (templates.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-bg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-primary">Workflow templates</div>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary/70">
            Built-in cowork routines you can run as-is or duplicate into a custom workflow.
          </p>
        </div>
        <Badge color="blue">{templates.length} built-in</Badge>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {templates.map((workflow) => {
          const meta = TEMPLATE_META[workflow.id as keyof typeof TEMPLATE_META];
          const Icon = meta.icon;
          const scheduleLabel = workflow.schedule
            ? describeWorkflowSchedule({
                ...workflow.schedule,
                enabled: true,
              })
            : null;
          const signals = readWorkflowSignals(workflow);
          const isRunning = runningWorkflowId === workflow.id;
          const isBusy = busyAction?.workflowId === workflow.id;

          return (
            <div key={workflow.id} className="rounded-xl border border-border bg-bg-primary/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5">
                      <Icon size={16} className="text-accent-blue" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-primary">{workflow.name}</div>
                      <div className="mt-0.5 text-[11px] text-text-secondary/55">{meta.spotlight}</div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-text-secondary/75">
                    {workflow.description || meta.helper}
                  </p>
                </div>

                {isRunning ? <Badge color="green">running</Badge> : <Badge color={meta.accent}>template</Badge>}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge color="gray">{workflow.steps.length} steps</Badge>
                {signals.map((signal) => (
                  <Badge key={signal} color="gray">
                    {signal}
                  </Badge>
                ))}
              </div>

              {scheduleLabel && (
                <div className="mt-3 text-[11px] text-text-secondary/60">
                  Default cadence: {scheduleLabel}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    setBusyAction({ workflowId: workflow.id, kind: "run" });
                    try {
                      await onRun(workflow.id);
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                  disabled={isBusy || Boolean(runningWorkflowId)}
                >
                  <Play size={14} />
                  {busyAction?.workflowId === workflow.id && busyAction.kind === "run" ? "Starting..." : "Run now"}
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    setBusyAction({ workflowId: workflow.id, kind: "customize" });
                    try {
                      await onCustomize(workflow);
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                  disabled={isBusy}
                >
                  {busyAction?.workflowId === workflow.id && busyAction.kind === "customize"
                    ? "Creating..."
                    : "Customize"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
