import type { BrowserToolArgs } from "./runtime.js";

export type WebRecipeStepAction = BrowserToolArgs["action"];

export type WebRecipeStepArgValue = string | number | boolean;

export type WebRecipeFieldDefinition = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "json";
  description?: string;
  required?: boolean;
};

export type WebRecipeStep = {
  id: string;
  label: string;
  action: WebRecipeStepAction;
  args: Record<string, WebRecipeStepArgValue>;
};

export type WebRecipe = {
  id: string;
  name: string;
  description: string;
  steps: WebRecipeStep[];
  tags: string[];
  connectionId?: string;
  targetSite?: string;
  inputSchema?: WebRecipeFieldDefinition[];
  expectedOutputs?: WebRecipeFieldDefinition[];
  requiresApprovalProfile?: string;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
};

export type WebRecipeStepRun = {
  stepId: string;
  label: string;
  action: WebRecipeStepAction;
  status: "pending" | "running" | "completed" | "failed";
  content?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
};

export type WebRecipeRunResult = {
  recipeId: string;
  sessionId: string;
  startedAt: number;
  completedAt: number;
  steps: WebRecipeStepRun[];
  error?: string;
};

export type WebRecipeRecording = {
  recordingId: string;
  sessionId: string;
  recipeId?: string;
  steps: WebRecipeStep[];
  startedAt: number;
};
