import type { TaskPolicyProfile, TaskType } from "../../src/types/runtime.js";
import type { V2AppSettings } from "./v2EntityStore.js";

function hasCodeSignal(text: string): boolean {
  return /\b(file|code|patch|diff|refactor|bug|test|typescript|javascript|python|component|function|class)\b/i.test(
    text,
  );
}

function hasCommandSignal(text: string): boolean {
  return /\b(command|terminal|shell|run|npm|pnpm|yarn|git|build|test)\b/i.test(text);
}

function hasResearchSignal(text: string): boolean {
  return /\bplan|research|investigate|analyze|compare|understand|explain\b/i.test(text);
}

function hasSimpleChatSignal(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return /^(oi+|ol[aá]|opa|e ai|e aí|hey|hello|hi+|bom dia|boa tarde|boa noite|ok|obrigado|valeu|qual seu nome\??|quem é você\??|quem e voce\??|tudo bem\??)$/.test(
    normalized,
  );
}

function hasWorkspaceOperationalSignal(text: string): boolean {
  return /\b(workspace|diret[oó]rio|diretorio|pasta|pastas|arquivo|arquivos|file|files|listar|liste|list|procure|busque|search|read|ler|leia|abra|open)\b/i.test(
    text,
  );
}

export function classifyTask(params: {
  prompt: string;
  toolHistoryCount?: number;
  workspaceRoot?: string;
}): TaskType {
  const prompt = params.prompt.trim();
  if (!prompt) {
    return "chat_simple";
  }
  if (hasSimpleChatSignal(prompt)) {
    return "chat_simple";
  }
  if (hasCommandSignal(prompt) && !hasCodeSignal(prompt)) {
    return "command_exec";
  }
  if (hasCodeSignal(prompt) && /\b(review|fix|repair|regression)\b/i.test(prompt)) {
    return "review_fix";
  }
  if (hasCodeSignal(prompt) && /\b(change|edit|implement|write|update|create)\b/i.test(prompt)) {
    return "code_change";
  }
  if (hasCodeSignal(prompt)) {
    return "code_read";
  }
  if (params.workspaceRoot && hasWorkspaceOperationalSignal(prompt)) {
    return "code_read";
  }
  if (hasResearchSignal(prompt)) {
    return "plan_research";
  }
  return "chat_simple";
}

export function buildTaskPolicy(
  taskType: TaskType,
  settings: V2AppSettings,
): TaskPolicyProfile {
  const reasoningEffort = settings.reasoningPolicyByTask[taskType] ?? settings.reasoningEffort;
  const model =
    taskType === "chat_simple"
      ? settings.fastModelRef || settings.defaultModelRef
      : taskType === "review_fix"
        ? settings.reviewModelRef || settings.defaultModelRef
        : settings.defaultModelRef;

  return {
    taskType,
    modelRef: model || settings.defaultModelRef,
    reasoningEffort,
  };
}
