import React from "react";
import type { AutomationValidationCheck, AutomationValidationReport } from "../../../../src/types/automation.js";
import Badge from "../shared/Badge";

function severityColor(
  severity: AutomationValidationCheck["severity"],
): "blue" | "orange" | "red" {
  if (severity === "error") {
    return "red";
  }
  if (severity === "warning") {
    return "orange";
  }
  return "blue";
}

export default function ValidationReport({
  report,
}: {
  report: AutomationValidationReport;
}) {
  const errorCount = report.checks.filter((check) => check.severity === "error").length;
  const warningCount = report.checks.filter((check) => check.severity === "warning").length;
  const infoCount = report.checks.filter((check) => check.severity === "info").length;

  return (
    <section className="rounded-2xl border border-border bg-bg-secondary p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Validation report</h3>
          <p className="mt-1 text-xs text-text-secondary">{report.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color={report.valid ? "green" : "red"}>
            {report.valid ? "ready" : "has blockers"}
          </Badge>
          {errorCount > 0 && <Badge color="red">{errorCount} error(s)</Badge>}
          {warningCount > 0 && <Badge color="orange">{warningCount} warning(s)</Badge>}
          {infoCount > 0 && <Badge color="blue">{infoCount} info</Badge>}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {report.checks.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-secondary">
            No structural issues were found in the latest validation.
          </div>
        ) : (
          report.checks.map((check) => (
            <div
              key={`${check.code}-${check.field ?? "general"}-${check.message}`}
              className="rounded-xl border border-border bg-bg-tertiary px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={severityColor(check.severity)}>{check.severity}</Badge>
                <span className="text-xs font-medium text-text-primary">{check.code}</span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">{check.message}</p>
              {check.field && (
                <p className="mt-1 text-[11px] font-mono text-text-secondary/60">
                  {check.field}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
