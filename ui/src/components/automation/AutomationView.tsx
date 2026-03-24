import React, { useEffect, useState } from "react";
import { Bot, Package2, RefreshCw, Timer } from "lucide-react";
import type { AutomationPackageStatus } from "../../../../src/types/automation.js";
import { useAutomationStore } from "../../stores/automationStore";
import AutomationPackageReview from "./AutomationPackageReview";
import CronManager from "./CronManager";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";
import Tabs from "../shared/Tabs";

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

export default function AutomationView() {
  const [activeTab, setActiveTab] = useState("packages");
  const {
    packages,
    loaded,
    loadingList,
    selectedPackageId,
    selectedPackageState,
    loadingState,
    busyAction,
    error,
    loadPackages,
    selectPackage,
    refreshSelectedPackage,
    validateSelectedPackage,
    activateSelectedPackage,
    deactivateSelectedPackage,
    clearError,
  } = useAutomationStore();

  useEffect(() => {
    if (!loaded && !loadingList) {
      void loadPackages();
    }
  }, [loaded, loadingList, loadPackages]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Package2 size={18} className="text-accent-blue" />
              <h1 className="text-lg font-semibold text-text-primary">Automation</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-text-secondary">
              Review authored automation packages, validate blockers, and activate recurring runs
              without jumping across multiple screens.
            </p>
          </div>

          <Button variant="secondary" size="sm" onClick={() => void loadPackages()}>
            <RefreshCw size={14} />
            Refresh list
          </Button>
        </div>

        <Tabs
          tabs={[
            { id: "packages", label: "Packages" },
            { id: "schedule", label: "Schedules" },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-red-400">Automation action failed</div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-red-100">{error}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearError}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {activeTab === "schedule" ? (
          <div className="rounded-2xl border border-border bg-bg-secondary/40">
            <CronManager />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-border bg-bg-secondary p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium text-text-primary">Packages</h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    Drafts, packages waiting for credentials, and active automations.
                  </p>
                </div>
                <Badge color="gray">{packages.length}</Badge>
              </div>

              <div className="mt-4 space-y-2">
                {loadingList && packages.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-bg-tertiary px-4 py-6 text-sm text-text-secondary">
                    Loading automation packages...
                  </div>
                ) : packages.length === 0 ? (
                  <EmptyState
                    icon={Bot}
                    title="No automation packages yet"
                    description="Use the chat authoring flow to create a draft package, then review it here."
                  />
                ) : (
                  packages.map((automationPackage) => {
                    const isSelected = automationPackage.id === selectedPackageId;
                    return (
                      <button
                        key={automationPackage.id}
                        type="button"
                        onClick={() => void selectPackage(automationPackage.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "border-accent-blue bg-accent-blue/8"
                            : "border-border bg-bg-tertiary hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-text-primary">
                              {automationPackage.title}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs text-text-secondary">
                              {automationPackage.goal || "No goal recorded"}
                            </div>
                          </div>
                          <Badge color={statusColor(automationPackage.status)}>
                            {automationPackage.status}
                          </Badge>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-secondary/70">
                          {automationPackage.workflowId && <span>workflow</span>}
                          {automationPackage.recipeIds.length > 0 && (
                            <span>{automationPackage.recipeIds.length} recipe(s)</span>
                          )}
                          {automationPackage.connectionIds.length > 0 && (
                            <span>{automationPackage.connectionIds.length} connection(s)</span>
                          )}
                          {automationPackage.cronJobIds.length > 0 && (
                            <span>{automationPackage.cronJobIds.length} cron(s)</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section>
              {selectedPackageId && loadingState && !selectedPackageState ? (
                <div className="rounded-2xl border border-border bg-bg-secondary px-4 py-8 text-sm text-text-secondary">
                  Loading package review...
                </div>
              ) : selectedPackageState ? (
                <AutomationPackageReview
                  packageState={selectedPackageState}
                  busyAction={busyAction}
                  onRefresh={() => void refreshSelectedPackage()}
                  onValidate={() => void validateSelectedPackage()}
                  onActivate={() => void activateSelectedPackage()}
                  onDeactivate={() => void deactivateSelectedPackage()}
                />
              ) : (
                <div className="rounded-2xl border border-border bg-bg-secondary px-4 py-12">
                  <EmptyState
                    icon={Timer}
                    title="Select a package"
                    description="Choose an automation package from the list to inspect validation, connections, and activation policy."
                  />
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
