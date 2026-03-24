import React from "react";
import type { AutomationActivationPolicy } from "../../../../src/types/automation.js";
import Badge from "../shared/Badge";

function policyModeColor(
  mode: AutomationActivationPolicy["mode"],
): "blue" | "orange" | "green" {
  if (mode === "trusted_package") {
    return "green";
  }
  if (mode === "semi_autonomous") {
    return "orange";
  }
  return "blue";
}

function listLabel(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "Not restricted yet";
}

export default function ActivationPolicyPanel({
  policy,
}: {
  policy: AutomationActivationPolicy;
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-secondary p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Activation policy</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Review the trust level and scope before enabling this package in the background.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color={policyModeColor(policy.mode)}>{policy.mode}</Badge>
          <Badge color="gray">{policy.approvalProfileId}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary/60">
            Dry run
          </div>
          <div className="mt-1 text-sm text-text-primary">
            {policy.requiresDryRun ? "Required before activation" : "Optional"}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary/60">
            Background execution
          </div>
          <div className="mt-1 text-sm text-text-primary">
            {policy.allowBackgroundRun ? "Allowed" : "Blocked until explicitly enabled"}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary/60">
            Allowed tools
          </div>
          <div className="mt-1 text-sm text-text-primary">
            {listLabel(policy.allowedToolNames)}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary/60">
            Allowed domains
          </div>
          <div className="mt-1 text-sm text-text-primary">
            {listLabel(policy.allowedDomains)}
          </div>
        </div>
      </div>
    </section>
  );
}
