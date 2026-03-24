import React from "react";
import { AlertTriangle, CheckCircle2, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import type { AutomationPackageStatus } from "../../../../src/types/automation.js";
import type { AutomationPackageRuntimeState } from "../../stores/automationStore";
import ActivationPolicyPanel from "./ActivationPolicyPanel";
import ConnectionSetupCard from "./ConnectionSetupCard";
import ValidationReport from "./ValidationReport";
import Badge from "../shared/Badge";
import Button from "../shared/Button";

function statusColor(
  status: AutomationPackageStatus,
): "green" | "blue" | "orange" | "red" | "gray" {
  if (status === "active") {
    return "green";
  }
  if (status === "ready_for_activation") {
    return "blue";
  }
  if (status === "needs_credentials" || status === "needs_mapping") {
    return "orange";
  }
  if (status === "degraded") {
    return "red";
  }
  return "gray";
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-secondary p-4">
      <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary/60">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-text-primary">{value}</div>
      <div className="mt-1 text-xs text-text-secondary">{hint}</div>
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      <p className="mt-1 text-xs text-text-secondary">{subtitle}</p>
    </div>
  );
}

export default function AutomationPackageReview({
  packageState,
  busyAction,
  onRefresh,
  onValidate,
  onActivate,
  onDeactivate,
}: {
  packageState: AutomationPackageRuntimeState;
  busyAction: "validate" | "activate" | "deactivate" | null;
  onRefresh: () => void;
  onValidate: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const { automationPackage, workflow, recipes, cronJobs, connections, validationReport, blockingIssues } =
    packageState;
  const hasBlockingIssues = blockingIssues.length > 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-bg-secondary p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">
                {automationPackage.title}
              </h2>
              <Badge color={statusColor(packageState.status)}>{packageState.status}</Badge>
              <Badge color="gray">{automationPackage.activationPolicy.mode}</Badge>
            </div>
            <p className="mt-2 text-sm text-text-secondary">{automationPackage.goal}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-secondary/70">
              <span>Created by {automationPackage.createdBy}</span>
              <span>Updated {new Date(automationPackage.updatedAt).toLocaleString()}</span>
              {automationPackage.lastValidatedAt && (
                <span>
                  Validated {new Date(automationPackage.lastValidatedAt).toLocaleString()}
                </span>
              )}
              {automationPackage.lastActivatedAt && (
                <span>
                  Activated {new Date(automationPackage.lastActivatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={busyAction !== null}
            >
              <RefreshCw size={14} />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onValidate}
              disabled={busyAction !== null}
            >
              <CheckCircle2 size={14} />
              {busyAction === "validate" ? "Validating..." : "Validate package"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onActivate}
              disabled={busyAction !== null}
            >
              <PlayCircle size={14} />
              {busyAction === "activate" ? "Activating..." : "Activate package"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeactivate}
              disabled={busyAction !== null}
            >
              <PauseCircle size={14} />
              {busyAction === "deactivate" ? "Pausing..." : "Deactivate"}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Workflow"
          value={workflow ? "1" : "0"}
          hint={workflow ? `${workflow.steps.length} step(s)` : "No workflow linked yet"}
        />
        <SummaryCard
          label="Recipes"
          value={String(recipes.length)}
          hint={recipes.length > 0 ? "Browser automations attached" : "No recipe in this package"}
        />
        <SummaryCard
          label="Connections"
          value={String(connections.length)}
          hint={
            connections.length > 0
              ? `${connections.filter((connection) => connection.status === "ready").length} ready`
              : "No persistent connection required"
          }
        />
        <SummaryCard
          label="Schedules"
          value={String(cronJobs.length)}
          hint={cronJobs.length > 0 ? "Recurring jobs linked" : "Runs manually for now"}
        />
      </div>

      {hasBlockingIssues && (
        <section className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-red-400">
            <AlertTriangle size={16} />
            Blocking issues
          </div>
          <div className="mt-3 space-y-2">
            {blockingIssues.map((issue) => (
              <div
                key={issue}
                className="rounded-xl border border-red-500/10 bg-black/10 px-3 py-2 text-xs text-red-100"
              >
                {issue}
              </div>
            ))}
          </div>
        </section>
      )}

      <ValidationReport report={validationReport} />

      <ActivationPolicyPanel policy={automationPackage.activationPolicy} />

      <section className="rounded-2xl border border-border bg-bg-secondary p-4">
        <SectionTitle
          title="Artifacts"
          subtitle="Review the concrete entities that were materialized for this package."
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-bg-tertiary p-4">
            <div className="text-xs font-medium text-text-primary">Workflow</div>
            {workflow ? (
              <div className="mt-2 space-y-2 text-xs text-text-secondary">
                <div className="text-text-primary">{workflow.name}</div>
                <div>{workflow.description || "No description"}</div>
                <div>{workflow.steps.length} step(s)</div>
                {workflow.documentInputSchema?.length ? (
                  <div>{workflow.documentInputSchema.length} document input(s)</div>
                ) : (
                  <div>No document input schema</div>
                )}
              </div>
            ) : (
              <div className="mt-2 text-xs text-text-secondary">No workflow linked yet.</div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-bg-tertiary p-4">
            <div className="text-xs font-medium text-text-primary">Recipes</div>
            <div className="mt-2 space-y-2">
              {recipes.length === 0 ? (
                <div className="text-xs text-text-secondary">No browser recipes in this package.</div>
              ) : (
                recipes.map((recipe) => (
                  <div key={recipe.id} className="rounded-xl border border-border bg-bg-primary/40 px-3 py-2">
                    <div className="text-xs font-medium text-text-primary">{recipe.name}</div>
                    <div className="mt-1 text-[11px] text-text-secondary">
                      {recipe.steps.length} step(s)
                      {recipe.targetSite ? ` • ${recipe.targetSite}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-bg-tertiary p-4">
            <div className="text-xs font-medium text-text-primary">Schedules</div>
            <div className="mt-2 space-y-2">
              {cronJobs.length === 0 ? (
                <div className="text-xs text-text-secondary">No cron jobs linked to this package.</div>
              ) : (
                cronJobs.map((cronJob) => (
                  <div key={cronJob.id} className="rounded-xl border border-border bg-bg-primary/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-text-primary">{cronJob.name}</div>
                      <Badge color={cronJob.enabled ? "green" : "gray"}>
                        {cronJob.enabled ? "enabled" : "disabled"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-[11px] font-mono text-text-secondary">
                      {cronJob.cronExpr}
                    </div>
                    {cronJob.nextRun && (
                      <div className="mt-1 text-[11px] text-text-secondary/70">
                        Next run {new Date(cronJob.nextRun).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Connections"
          subtitle="Persistent credentials and browser sessions required by this package."
        />
        {connections.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-secondary px-4 py-6 text-sm text-text-secondary">
            This package does not require a persistent connection.
          </div>
        ) : (
          connections.map((connection) => (
            <ConnectionSetupCard key={connection.id} connection={connection} />
          ))
        )}
      </section>
    </div>
  );
}
