import { create } from "zustand";
import type {
  AutomationPackage,
  AutomationPackageStatus,
  AutomationValidationReport,
} from "../../../src/types/automation.js";
import type { Connection } from "../../../src/types/connection.js";
import type { WebRecipe } from "../../../src/types/webRecipe.js";
import type { Workflow } from "../../../src/types/workflow.js";

const api = () => (window as any).codexAgent;

export type AutomationCronJobSummary = {
  id: string;
  name: string;
  cronExpr: string;
  actionType: string;
  enabled: boolean;
  nextRun?: number;
  lastRun?: number;
  runCount: number;
  lastError?: string;
};

export type AutomationPackageRuntimeState = {
  automationPackage: AutomationPackage;
  workflow?: Workflow;
  recipes: WebRecipe[];
  cronJobs: AutomationCronJobSummary[];
  connections: Connection[];
  validationReport: AutomationValidationReport;
  blockingIssues: string[];
  status: AutomationPackageStatus;
  changedCronJobs: AutomationCronJobSummary[];
};

type AutomationBusyAction = "validate" | "activate" | "deactivate" | null;

type AutomationState = {
  packages: AutomationPackage[];
  loaded: boolean;
  loadingList: boolean;
  selectedPackageId?: string;
  selectedPackageState: AutomationPackageRuntimeState | null;
  loadingState: boolean;
  busyAction: AutomationBusyAction;
  error?: string;
  loadPackages: () => Promise<void>;
  selectPackage: (packageId: string) => Promise<void>;
  refreshSelectedPackage: () => Promise<void>;
  validateSelectedPackage: () => Promise<void>;
  activateSelectedPackage: () => Promise<void>;
  deactivateSelectedPackage: () => Promise<void>;
  clearError: () => void;
};

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(message) as { error?: string };
    if (parsed.error?.trim()) {
      return parsed.error.trim();
    }
  } catch {
    // Fall through to the original message.
  }
  return message;
}

function sortPackages(packages: AutomationPackage[]): AutomationPackage[] {
  return [...packages].sort((left, right) => right.updatedAt - left.updatedAt);
}

function upsertPackage(
  packages: AutomationPackage[],
  automationPackage: AutomationPackage,
): AutomationPackage[] {
  return sortPackages([
    automationPackage,
    ...packages.filter((candidate) => candidate.id !== automationPackage.id),
  ]);
}

export const useAutomationStore = create<AutomationState>((set, get) => ({
  packages: [],
  loaded: false,
  loadingList: false,
  selectedPackageId: undefined,
  selectedPackageState: null,
  loadingState: false,
  busyAction: null,
  error: undefined,

  loadPackages: async () => {
    set({ loadingList: true, error: undefined });
    try {
      const packages = sortPackages(await api().store.listAutomationPackages());
      const currentSelectedId = get().selectedPackageId;
      const nextSelectedId =
        currentSelectedId && packages.some((automationPackage) => automationPackage.id === currentSelectedId)
          ? currentSelectedId
          : packages[0]?.id;

      set({
        packages,
        loaded: true,
        loadingList: false,
        selectedPackageId: nextSelectedId,
        selectedPackageState:
          nextSelectedId === currentSelectedId ? get().selectedPackageState : null,
      });

      if (nextSelectedId) {
        await get().selectPackage(nextSelectedId);
      }
    } catch (error) {
      set({
        loaded: true,
        loadingList: false,
        error: normalizeError(error),
      });
    }
  },

  selectPackage: async (packageId) => {
    set({
      selectedPackageId: packageId,
      loadingState: true,
      error: undefined,
    });

    try {
      const selectedPackageState = await api().automation.inspectPackage(packageId);
      set((state) => ({
        selectedPackageState,
        loadingState: false,
        packages: upsertPackage(state.packages, selectedPackageState.automationPackage),
      }));
    } catch (error) {
      set({
        loadingState: false,
        error: normalizeError(error),
      });
    }
  },

  refreshSelectedPackage: async () => {
    const selectedPackageId = get().selectedPackageId;
    if (!selectedPackageId) {
      return;
    }
    await get().selectPackage(selectedPackageId);
  },

  validateSelectedPackage: async () => {
    const selectedPackageId = get().selectedPackageId;
    if (!selectedPackageId) {
      return;
    }

    set({ busyAction: "validate", error: undefined });
    try {
      const selectedPackageState = await api().automation.validatePackage(selectedPackageId);
      set((state) => ({
        busyAction: null,
        selectedPackageState,
        packages: upsertPackage(state.packages, selectedPackageState.automationPackage),
      }));
    } catch (error) {
      set({
        busyAction: null,
        error: normalizeError(error),
      });
    }
  },

  activateSelectedPackage: async () => {
    const selectedPackageId = get().selectedPackageId;
    if (!selectedPackageId) {
      return;
    }

    set({ busyAction: "activate", error: undefined });
    try {
      const selectedPackageState = await api().automation.activatePackage(selectedPackageId);
      set((state) => ({
        busyAction: null,
        selectedPackageState,
        packages: upsertPackage(state.packages, selectedPackageState.automationPackage),
      }));
    } catch (error) {
      set({
        busyAction: null,
        error: normalizeError(error),
      });
    }
  },

  deactivateSelectedPackage: async () => {
    const selectedPackageId = get().selectedPackageId;
    if (!selectedPackageId) {
      return;
    }

    set({ busyAction: "deactivate", error: undefined });
    try {
      const selectedPackageState = await api().automation.deactivatePackage(selectedPackageId);
      set((state) => ({
        busyAction: null,
        selectedPackageState,
        packages: upsertPackage(state.packages, selectedPackageState.automationPackage),
      }));
    } catch (error) {
      set({
        busyAction: null,
        error: normalizeError(error),
      });
    }
  },

  clearError: () => set({ error: undefined }),
}));
