import React from "react";
import type { Connection } from "../../../../src/types/connection.js";
import Badge from "../shared/Badge";

function statusColor(status: Connection["status"]): "green" | "blue" | "orange" | "red" | "gray" {
  if (status === "ready") {
    return "green";
  }
  if (status === "pending_login" || status === "pending_credentials") {
    return "orange";
  }
  if (status === "error" || status === "expired") {
    return "red";
  }
  if (status === "draft") {
    return "blue";
  }
  return "gray";
}

function buildSetupHint(connection: Connection): string {
  if (connection.status === "pending_login") {
    return "This package still needs a persistent browser login before activation.";
  }
  if (connection.status === "pending_credentials") {
    return "Bind credentials or a secret reference before this package can run reliably.";
  }
  if (connection.status === "expired") {
    return "The saved authentication appears to be expired and should be refreshed.";
  }
  if (connection.status === "error") {
    return "The connection is in an error state and should be revalidated.";
  }
  if (connection.status === "ready") {
    return "Connection validated and ready for recurring automation.";
  }
  return "Draft connection created by the authoring flow and awaiting review.";
}

export default function ConnectionSetupCard({
  connection,
}: {
  connection: Connection;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-secondary p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">{connection.label}</h3>
          <p className="mt-1 text-xs text-text-secondary">{buildSetupHint(connection)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color={statusColor(connection.status)}>{connection.status}</Badge>
          <Badge color="gray">{connection.authType}</Badge>
          <Badge color="gray">{connection.provider}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-xs text-text-secondary md:grid-cols-2">
        <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary/60">
            Target
          </div>
          <div className="mt-1 break-all text-text-primary">
            {connection.targetSite || connection.loginUrl || "Not defined yet"}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary/60">
            Validation
          </div>
          <div className="mt-1 text-text-primary">
            {connection.lastValidatedAt
              ? new Date(connection.lastValidatedAt).toLocaleString()
              : "No validation recorded yet"}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary/60">
            Secret Ref
          </div>
          <div className="mt-1 break-all text-text-primary">
            {connection.secretRef || "Not bound"}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary/60">
            Browser Profile
          </div>
          <div className="mt-1 break-all text-text-primary">
            {connection.browserProfileId || "Not created yet"}
          </div>
        </div>
      </div>
    </div>
  );
}
