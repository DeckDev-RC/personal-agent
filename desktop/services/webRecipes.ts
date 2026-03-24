import { randomUUID } from "node:crypto";
import type { BrowserToolName } from "./browserTools.js";
import {
  executeBrowserTool,
  subscribeBrowserActionEvents,
  type BrowserActionEvent,
} from "./browserRuntime.js";
import {
  deleteWebRecipeV2,
  getSettingsV2,
  getWebRecipeV2,
  listWebRecipesV2,
  saveWebRecipeV2,
} from "./v2EntityStore.js";
import { createSessionRecord, getSessionRecord } from "./v2SessionStore.js";
import {
  ensureConnectionBrowserProfile,
  resolveConnectionSessionId,
} from "./connectionManager.js";
import type {
  WebRecipe,
  WebRecipeFieldDefinition,
  WebRecipeRecording,
  WebRecipeRunResult,
  WebRecipeStep,
  WebRecipeStepAction,
  WebRecipeStepArgValue,
  WebRecipeStepRun,
} from "../../src/types/webRecipe.js";

type ExecuteWebRecipeParams = {
  recipeId?: string;
  recipe?: WebRecipe;
  sessionId?: string;
  onStep?: (step: WebRecipeStepRun) => void;
};

type StopRecordingParams = {
  recordingId: string;
  persist?: boolean;
  name?: string;
  description?: string;
  tags?: string[];
};

const activeRecordings = new Map<string, WebRecipeRecording>();
let recordingSubscriptionReady = false;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
}

function normalizeStepArgValue(value: unknown): WebRecipeStepArgValue {
  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  return JSON.stringify(value);
}

function normalizeFieldDefinitions(value: unknown): WebRecipeFieldDefinition[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? entry : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry, index) => ({
      key: String(entry.key ?? `field_${index + 1}`).trim(),
      label: String(entry.label ?? entry.key ?? `Field ${index + 1}`).trim(),
      type:
        entry.type === "number" || entry.type === "boolean" || entry.type === "json"
          ? entry.type
          : "string",
      description: typeof entry.description === "string" ? entry.description.trim() || undefined : undefined,
      required: entry.required === true,
    }));
}

function normalizeStep(step: Partial<WebRecipeStep>, fallbackTimestamp = Date.now()): WebRecipeStep {
  const action = String(step.action ?? "browser_open") as WebRecipeStepAction;
  const args =
    step.args && typeof step.args === "object"
      ? Object.fromEntries(
          Object.entries(step.args).map(([key, value]) => [key, normalizeStepArgValue(value)]),
        )
      : {};

  return {
    id: String(step.id ?? `${action}-${fallbackTimestamp}-${generateId()}`),
    label: step.label?.trim() || defaultStepLabel(action),
    action,
    args,
  };
}

export function normalizeWebRecipe(partial: Partial<WebRecipe>, fallbackTimestamp = Date.now()): WebRecipe {
  return {
    id: String(partial.id ?? generateId()),
    name: partial.name?.trim() || "Nova web recipe",
    description: partial.description?.trim() || "",
    steps: Array.isArray(partial.steps)
      ? partial.steps.map((step, index) => normalizeStep(step, fallbackTimestamp + index))
      : [],
    tags: normalizeTags(partial.tags),
    connectionId: partial.connectionId?.trim() || undefined,
    targetSite: partial.targetSite?.trim() || undefined,
    inputSchema: normalizeFieldDefinitions(partial.inputSchema),
    expectedOutputs: normalizeFieldDefinitions(partial.expectedOutputs),
    requiresApprovalProfile: partial.requiresApprovalProfile?.trim() || undefined,
    createdAt: Number(partial.createdAt ?? fallbackTimestamp),
    updatedAt: Number(partial.updatedAt ?? fallbackTimestamp),
    lastRunAt: typeof partial.lastRunAt === "number" ? partial.lastRunAt : undefined,
  };
}

function defaultStepLabel(action: WebRecipeStepAction): string {
  switch (action) {
    case "browser_tabs":
      return "Listar abas";
    case "browser_open":
      return "Abrir pagina";
    case "browser_click":
      return "Clicar elemento";
    case "browser_hover":
      return "Passar o mouse";
    case "browser_type":
      return "Preencher campo";
    case "browser_drag":
      return "Arrastar elemento";
    case "browser_select":
      return "Selecionar opcao";
    case "browser_fill":
      return "Preencher formulario";
    case "browser_wait":
      return "Aguardar condicao";
    case "browser_evaluate":
      return "Executar script";
    case "browser_batch":
      return "Executar lote";
    case "browser_set_input_files":
      return "Definir arquivos";
    case "browser_handle_dialog":
      return "Preparar dialogo";
    case "browser_screenshot":
      return "Capturar screenshot";
    case "browser_extract_text":
      return "Extrair texto";
    case "browser_snapshot":
      return "Capturar snapshot";
    case "browser_close":
      return "Fechar browser";
  }
}

function cloneStep(step: WebRecipeStep): WebRecipeStep {
  return {
    ...step,
    args: { ...step.args },
  };
}

function cloneRecording(recording: WebRecipeRecording): WebRecipeRecording {
  return {
    ...recording,
    steps: recording.steps.map(cloneStep),
  };
}

function summarizeContent(content: string | undefined): string | undefined {
  if (!content) {
    return undefined;
  }
  const normalized = content.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > 1_200 ? `${normalized.slice(0, 1_200)}...` : normalized;
}

async function ensureRecipeSession(sessionId: string | undefined, recipeName: string): Promise<string> {
  if (sessionId) {
    const existing = await getSessionRecord(sessionId);
    if (existing) {
      return existing.sessionId;
    }
  }

  const settings = await getSettingsV2();
  const session = await createSessionRecord({
    title: `Recipe: ${recipeName}`,
    model: settings.defaultModelRef,
    systemPrompt: "You are executing a browser automation recipe.",
    sessionId,
  });
  return session.sessionId;
}

function ensureRecordingSubscription(): void {
  if (recordingSubscriptionReady) {
    return;
  }

  subscribeBrowserActionEvents((event) => {
    captureBrowserAction(event);
  });
  recordingSubscriptionReady = true;
}

function isRecordableBrowserAction(action: BrowserToolName): action is WebRecipeStepAction {
  switch (action) {
    case "browser_tabs":
    case "browser_open":
    case "browser_snapshot":
    case "browser_click":
    case "browser_hover":
    case "browser_type":
    case "browser_drag":
    case "browser_select":
    case "browser_fill":
    case "browser_wait":
    case "browser_evaluate":
    case "browser_batch":
    case "browser_set_input_files":
    case "browser_handle_dialog":
    case "browser_screenshot":
    case "browser_extract_text":
    case "browser_close":
      return true;
    default:
      return false;
  }
}

function captureBrowserAction(event: BrowserActionEvent): void {
  if (!isRecordableBrowserAction(event.action)) {
    return;
  }

  for (const [recordingId, recording] of activeRecordings.entries()) {
    if (recording.sessionId !== event.sessionId) {
      continue;
    }
    const nextStep = normalizeStep({
      id: `${recordingId}-${event.timestamp}`,
      label: defaultStepLabel(event.action),
      action: event.action,
      args: event.args as Record<string, WebRecipeStepArgValue>,
    }, event.timestamp);
    activeRecordings.set(recordingId, {
      ...recording,
      steps: [...recording.steps, nextStep],
    });
  }
}

async function resolveRecipe(params: ExecuteWebRecipeParams): Promise<WebRecipe> {
  if (params.recipe) {
    return normalizeWebRecipe(params.recipe, params.recipe.updatedAt ?? Date.now());
  }

  if (!params.recipeId) {
    throw new Error("recipeId is required.");
  }

  const recipe = await getWebRecipeV2(params.recipeId);
  if (!recipe) {
    throw new Error(`Recipe not found: ${params.recipeId}`);
  }

  return normalizeWebRecipe(recipe, recipe.updatedAt);
}

export async function listWebRecipes(): Promise<WebRecipe[]> {
  return await listWebRecipesV2();
}

export async function getWebRecipe(recipeId: string): Promise<WebRecipe | null> {
  const recipe = await getWebRecipeV2(recipeId);
  return recipe ? normalizeWebRecipe(recipe, recipe.updatedAt) : null;
}

export async function saveWebRecipe(recipe: WebRecipe): Promise<WebRecipe> {
  const normalized = normalizeWebRecipe(recipe, recipe.updatedAt ?? Date.now());
  await saveWebRecipeV2(normalized);
  return normalized;
}

export async function deleteWebRecipe(recipeId: string): Promise<void> {
  await deleteWebRecipeV2(recipeId);
}

export async function executeWebRecipe(params: ExecuteWebRecipeParams): Promise<WebRecipeRunResult> {
  const recipe = await resolveRecipe(params);
  const connectionScopedSessionId =
    !params.sessionId && recipe.connectionId
      ? resolveConnectionSessionId(recipe.connectionId)
      : undefined;
  if (recipe.connectionId) {
    await ensureConnectionBrowserProfile(recipe.connectionId).catch(() => undefined);
  }
  const sessionId = await ensureRecipeSession(
    params.sessionId ?? connectionScopedSessionId,
    recipe.name,
  );
  const startedAt = Date.now();
  const steps: WebRecipeStepRun[] = [];
  let errorText: string | undefined;

  for (const recipeStep of recipe.steps) {
    const runStep: WebRecipeStepRun = {
      stepId: recipeStep.id,
      label: recipeStep.label,
      action: recipeStep.action,
      status: "running",
      startedAt: Date.now(),
    };
    steps.push(runStep);
    params.onStep?.({ ...runStep });

    try {
      const result = await executeBrowserTool(recipeStep.action as BrowserToolName, recipeStep.args, {
        sessionId,
        connectionId: recipe.connectionId,
      });
      if (result.isError) {
        throw new Error(result.content || "Browser step failed.");
      }
      runStep.status = "completed";
      runStep.content = summarizeContent(result.content);
      runStep.completedAt = Date.now();
      params.onStep?.({ ...runStep });
    } catch (error) {
      runStep.status = "failed";
      runStep.error = error instanceof Error ? error.message : String(error);
      runStep.completedAt = Date.now();
      params.onStep?.({ ...runStep });
      errorText = runStep.error;
      break;
    }
  }

  const completedAt = Date.now();
  await saveWebRecipeV2({
    ...recipe,
    lastRunAt: completedAt,
    updatedAt: completedAt,
  });

  return {
    recipeId: recipe.id,
    sessionId,
    startedAt,
    completedAt,
    steps,
    error: errorText,
  };
}

export async function startWebRecipeRecording(params?: {
  sessionId?: string;
  recipeId?: string;
}): Promise<WebRecipeRecording> {
  ensureRecordingSubscription();

  const existingRecipe = params?.recipeId ? await getWebRecipeV2(params.recipeId) : null;
  const sessionId = await ensureRecipeSession(
    params?.sessionId,
    existingRecipe?.name ?? "Recipe recording",
  );

  const recording: WebRecipeRecording = {
    recordingId: randomUUID(),
    sessionId,
    recipeId: existingRecipe?.id,
    steps: existingRecipe?.steps.map(cloneStep) ?? [],
    startedAt: Date.now(),
  };
  activeRecordings.set(recording.recordingId, recording);
  return cloneRecording(recording);
}

export function listActiveWebRecipeRecordings(): WebRecipeRecording[] {
  return Array.from(activeRecordings.values()).map(cloneRecording);
}

export async function stopWebRecipeRecording(params: StopRecordingParams): Promise<{
  recording: WebRecipeRecording;
  recipe?: WebRecipe;
}> {
  const recording = activeRecordings.get(params.recordingId);
  if (!recording) {
    throw new Error(`Recording not found: ${params.recordingId}`);
  }

  activeRecordings.delete(params.recordingId);
  const snapshot = cloneRecording(recording);

  if (!params.persist) {
    return { recording: snapshot };
  }

  const existingRecipe = recording.recipeId ? await getWebRecipeV2(recording.recipeId) : null;
  const now = Date.now();
  const recipe = normalizeWebRecipe(
    {
      id: existingRecipe?.id ?? randomUUID(),
      name: params.name?.trim() || existingRecipe?.name || "Nova web recipe",
      description: params.description?.trim() ?? existingRecipe?.description ?? "",
      tags: params.tags ?? existingRecipe?.tags ?? [],
      steps: snapshot.steps,
      createdAt: existingRecipe?.createdAt ?? now,
      updatedAt: now,
      lastRunAt: existingRecipe?.lastRunAt,
    },
    now,
  );

  await saveWebRecipeV2(recipe);
  return {
    recording: snapshot,
    recipe,
  };
}
