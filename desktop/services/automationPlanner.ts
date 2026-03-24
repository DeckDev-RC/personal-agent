import { randomUUID } from "node:crypto";
import type {
  ApprovalProfileId,
  AutomationActivationMode,
  AutomationDraft,
  AutomationDraftConnection,
  AutomationDraftCronJob,
  AutomationDraftProjectContext,
  AutomationDraftRecipe,
  AutomationDraftRequirement,
  AutomationPackageStatus,
} from "../../src/types/automation.js";

type PlannedSchedule = {
  cronExpr: string;
  name: string;
};

const DAY_OF_WEEK_PATTERNS: Array<{
  cronValue: string;
  patterns: RegExp[];
}> = [
  { cronValue: "0", patterns: [/\bsunday\b/i, /\bdomingo\b/i] },
  { cronValue: "1", patterns: [/\bmonday\b/i, /\bsegunda(?:-feira)?\b/i] },
  { cronValue: "2", patterns: [/\btuesday\b/i, /\bterca(?:-feira)?\b/i] },
  { cronValue: "3", patterns: [/\bwednesday\b/i, /\bquarta(?:-feira)?\b/i] },
  { cronValue: "4", patterns: [/\bthursday\b/i, /\bquinta(?:-feira)?\b/i] },
  { cronValue: "5", patterns: [/\bfriday\b/i, /\bsexta(?:-feira)?\b/i] },
  { cronValue: "6", patterns: [/\bsaturday\b/i, /\bsabado\b/i] },
];

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "automation";
}

function cleanSentence(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function trimPromptLead(prompt: string): string {
  return prompt
    .replace(
      /^(cria(?:r)?|monte|gera(?:r)?|configure|configura(?:r)?|build|create|set up|setup)\s+/i,
      "",
    )
    .trim();
}

function inferTitle(prompt: string): string {
  const cleaned = trimPromptLead(cleanSentence(prompt))
    .replace(/^um[a]?\s+/i, "")
    .replace(/^o\s+/i, "")
    .replace(/^uma\s+/i, "");
  const short = cleaned.split(/[.!?]/)[0]?.trim() || cleaned;
  if (!short) {
    return "Novo pacote de automacao";
  }
  return short.charAt(0).toUpperCase() + short.slice(1, 96);
}

function extractUrl(prompt: string): URL | null {
  const match = prompt.match(/https?:\/\/[^\s)]+/i);
  if (!match) {
    return null;
  }
  try {
    return new URL(match[0]);
  } catch {
    return null;
  }
}

function inferTime(prompt: string): { hour: number; minute: number } {
  const normalized = normalizeSearchText(prompt);
  const match = normalized.match(
    /\b(?:at|as)\s+(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm)?\b/i,
  );
  if (!match) {
    return { hour: 8, minute: 0 };
  }

  let hour = Number(match[1] ?? 8);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  } else if (meridiem === "am" && hour === 12) {
    hour = 0;
  }

  return {
    hour: Math.max(0, Math.min(23, hour)),
    minute: Math.max(0, Math.min(59, minute)),
  };
}

function inferScheduledCron(prompt: string): PlannedSchedule | null {
  const normalized = normalizeSearchText(prompt);
  const { hour, minute } = inferTime(prompt);

  const intervalMatch = normalized.match(/\b(?:every|cada)\s+(\d+)\s+(minute|minutes|minuto|minutos)\b/);
  if (intervalMatch) {
    const everyMinutes = Math.max(1, Math.min(59, Number(intervalMatch[1] ?? "1")));
    return {
      cronExpr: `*/${everyMinutes} * * * *`,
      name: `A cada ${everyMinutes} minuto(s)`,
    };
  }

  if (/\b(?:every weekday|weekdays|dias uteis|segunda a sexta)\b/i.test(normalized)) {
    return {
      cronExpr: `${minute} ${hour} * * 1-5`,
      name: `Dias uteis ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    };
  }

  for (const day of DAY_OF_WEEK_PATTERNS) {
    if (day.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        cronExpr: `${minute} ${hour} * * ${day.cronValue}`,
        name: `Toda ${day.cronValue === "0" ? "semana" : "semana no dia definido"}`,
      };
    }
  }

  if (/\b(?:every day|daily|todo dia|todos os dias)\b/i.test(normalized)) {
    return {
      cronExpr: `${minute} ${hour} * * *`,
      name: `Diario ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    };
  }

  if (/\b(?:monthly|todo mes|mensal)\b/i.test(normalized)) {
    return {
      cronExpr: `${minute} ${hour} 1 * *`,
      name: `Mensal dia 1 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    };
  }

  return null;
}

function inferRequirements(prompt: string, hasUrl: boolean): {
  needsDocumentParser: boolean;
  needsRecipe: boolean;
  needsConnection: boolean;
  needsCredentials: boolean;
  needsMapping: boolean;
  needsTaskFallback: boolean;
  needsReminder: boolean;
  semiAutonomousOnly: boolean;
  approvalProfileId: ApprovalProfileId;
} {
  const normalized = normalizeSearchText(prompt);
  const needsDocumentParser =
    /\b(pdf|documento|document|arquivo|anexo|attachment|invoice|planilha|spreadsheet|csv|xlsx)\b/i.test(
      normalized,
    );
  const needsRecipe =
    hasUrl ||
    /\b(site|portal|erp|browser|web|login|naveg|clic|cadast|preench|submit|form)\b/i.test(
      normalized,
    );
  const needsConnection =
    needsRecipe ||
    /\b(login|oauth|senha|password|token|api key|api_key|credencial|credenciais)\b/i.test(
      normalized,
    );
  const needsCredentials = needsConnection;
  const needsMapping =
    needsDocumentParser &&
    !/\b(schema|campos|mapeamento|mapping|template|layout estruturado)\b/i.test(prompt);
  const needsTaskFallback =
    /\b(excec|exception|fallback|falha|erro|review|revisar|revisao)\b/i.test(normalized) ||
    needsDocumentParser ||
    needsRecipe;
  const needsReminder =
    /\b(lembre|lembrar|remind|alert|avise|avisa|notifique|notify)\b/i.test(normalized);
  const semiAutonomousOnly =
    /\b(captcha|2fa|mfa|otp|token sms|anti-bot)\b/i.test(normalized);
  const approvalProfileId: ApprovalProfileId = semiAutonomousOnly
    ? "manual_sensitive"
    : "manual_sensitive";

  return {
    needsDocumentParser,
    needsRecipe,
    needsConnection,
    needsCredentials,
    needsMapping,
    needsTaskFallback,
    needsReminder,
    semiAutonomousOnly,
    approvalProfileId,
  };
}

function buildRequirements(params: {
  needsDocumentParser: boolean;
  needsRecipe: boolean;
  needsConnection: boolean;
  cronJob: PlannedSchedule | null;
  needsTaskFallback: boolean;
  needsReminder: boolean;
}): AutomationDraftRequirement[] {
  return [
    {
      kind: "workflow",
      required: true,
      reason: "Toda automacao authorable precisa de um workflow coordenador.",
    },
    {
      kind: "recipe",
      required: params.needsRecipe,
      reason: params.needsRecipe
        ? "O pedido sugere navegacao web ou sistema alvo."
        : "O pedido nao exige navegacao web explicita.",
    },
    {
      kind: "connection",
      required: params.needsConnection,
      reason: params.needsConnection
        ? "Fluxos com login ou sistema externo precisam de conexao persistente."
        : "Nenhuma credencial explicita foi detectada.",
    },
    {
      kind: "cron",
      required: Boolean(params.cronJob),
      reason: params.cronJob
        ? "O pedido inclui recorrencia temporal."
        : "Nenhuma agenda automatica foi detectada.",
    },
    {
      kind: "document_parser",
      required: params.needsDocumentParser,
      reason: params.needsDocumentParser
        ? "O pedido menciona documento ou arquivo de entrada."
        : "Nenhum parser documental foi inferido.",
    },
    {
      kind: "task_fallback",
      required: params.needsTaskFallback,
      reason: params.needsTaskFallback
        ? "Falhas e excecoes devem virar trabalho estruturado."
        : "Nao foi inferido fallback operacional especifico.",
    },
    {
      kind: "reminder",
      required: params.needsReminder,
      reason: params.needsReminder
        ? "O pedido menciona lembrete ou alerta."
        : "Nenhum lembrete explicito foi detectado.",
    },
  ];
}

function resolveDraftStatus(params: {
  needsCredentials: boolean;
  needsMapping: boolean;
}): AutomationPackageStatus {
  if (params.needsCredentials) {
    return "needs_credentials";
  }
  if (params.needsMapping) {
    return "needs_mapping";
  }
  return "ready_for_activation";
}

function resolveActivationMode(semiAutonomousOnly: boolean): AutomationActivationMode {
  return semiAutonomousOnly ? "semi_autonomous" : "manual";
}

function buildRecipeDraft(params: {
  baseSlug: string;
  title: string;
  targetUrl: URL | null;
  connectionId?: string;
  needsDocumentParser: boolean;
}): AutomationDraftRecipe {
  const targetSite = params.targetUrl?.origin;
  const steps: AutomationDraftRecipe["steps"] = [];

  if (targetSite) {
    steps.push({
      id: `${params.baseSlug}-open`,
      label: "Abrir pagina inicial",
      action: "browser_open",
      args: { url: params.targetUrl!.toString() },
    });
  }

  steps.push({
    id: `${params.baseSlug}-snapshot`,
    label: "Capturar contexto inicial",
    action: "browser_snapshot",
    args: {},
  });

  return {
    id: `recipe-${params.baseSlug}`,
    name: `Recipe ${params.title}`,
    description: "Draft de recipe gerado a partir do pedido em linguagem natural.",
    connectionId: params.connectionId,
    targetSite,
    inputSchema: params.needsDocumentParser
      ? [
          {
            key: "document_payload",
            label: "Documento estruturado",
            type: "json",
            description: "Payload estruturado extraido do documento de entrada.",
            required: true,
          },
        ]
      : undefined,
    expectedOutputs: [
      {
        key: "result_summary",
        label: "Resumo da execucao",
        type: "string",
        required: false,
      },
    ],
    steps,
  };
}

function inferProjectContext(prompt: string, title: string): AutomationDraftProjectContext[] {
  if (!/\b(projeto|project|cliente|client|contexto)\b/i.test(prompt)) {
    return [];
  }

  return [
    {
      name: `${title} Contexto`,
      description: "Contexto draft gerado junto com o pacote de automacao.",
      stakeholders: [],
    },
  ];
}

export function planAutomationFromPrompt(prompt: string): AutomationDraft {
  const cleanedPrompt = cleanSentence(prompt);
  const targetUrl = extractUrl(cleanedPrompt);
  const title = inferTitle(cleanedPrompt);
  const slug = slugify(title);
  const schedule = inferScheduledCron(cleanedPrompt);
  const inferred = inferRequirements(cleanedPrompt, Boolean(targetUrl));
  const status = resolveDraftStatus({
    needsCredentials: inferred.needsCredentials,
    needsMapping: inferred.needsMapping,
  });
  const activationMode = resolveActivationMode(inferred.semiAutonomousOnly);
  const connectionId = inferred.needsConnection ? `connection-${slug}` : undefined;
  const recipe = inferred.needsRecipe
    ? buildRecipeDraft({
        baseSlug: slug,
        title,
        targetUrl,
        connectionId,
        needsDocumentParser: inferred.needsDocumentParser,
      })
    : null;
  const domain = targetUrl?.hostname?.toLowerCase();
  const provider = domain || slug;
  const reasoning: string[] = [
    "Workflow draft sera criado como orquestrador principal.",
  ];

  if (recipe) {
    reasoning.push("Recipe web draft foi inferido a partir de login, site alvo ou sistema externo.");
  }
  if (schedule) {
    reasoning.push(`Agenda detectada: ${schedule.cronExpr}.`);
  }
  if (inferred.needsDocumentParser) {
    reasoning.push("Entrada documental detectada; documento vira schema de entrada do workflow.");
  }
  if (inferred.needsCredentials) {
    reasoning.push("Conexao draft sera criada para desacoplar credenciais do chat.");
  }
  if (inferred.semiAutonomousOnly) {
    reasoning.push("Fluxo marcado como semi-autonomo por possivel CAPTCHA ou MFA.");
  }

  const connections: AutomationDraftConnection[] = connectionId
    ? [
        {
          id: connectionId,
          provider,
          label: domain ? `Conexao ${domain}` : `Conexao ${title}`,
          authType: /\b(api key|api_key|token)\b/i.test(cleanedPrompt) ? "api_key" : "browser_profile",
          loginUrl: targetUrl?.toString(),
          targetSite: targetUrl?.origin,
        },
      ]
    : [];

  const cronJobs: AutomationDraftCronJob[] = schedule
    ? [
        {
          id: `cron-${slug}`,
          name: schedule.name,
          cronExpr: schedule.cronExpr,
          enabled: false,
        },
      ]
    : [];

  return {
    id: randomUUID(),
    title,
    goal: cleanedPrompt,
    sourcePrompt: cleanedPrompt,
    status,
    activationMode,
    reasoning,
    requirements: buildRequirements({
      needsDocumentParser: inferred.needsDocumentParser,
      needsRecipe: inferred.needsRecipe,
      needsConnection: inferred.needsConnection,
      cronJob: schedule,
      needsTaskFallback: inferred.needsTaskFallback,
      needsReminder: inferred.needsReminder,
    }),
    suggestedAllowedDomains: domain ? [domain] : [],
    workflow: {
      id: `workflow-${slug}`,
      name: title,
      description: "Workflow draft gerado a partir do pedido em linguagem natural.",
      connectionIds: connectionId ? [connectionId] : [],
      recipeIds: recipe ? [recipe.id] : [],
      approvalProfileId: inferred.approvalProfileId,
      exceptionPolicy: {
        createTaskOnFailure: true,
        createReminderOnBlocked: inferred.needsReminder,
        notifyOnDegraded: true,
        checkpointOnFailure: true,
        maxRecoveryAttempts: 1,
      },
      documentInputSchema: inferred.needsDocumentParser
        ? [
            {
              id: "primary-document",
              label: "Documento principal",
              mimeTypes: ["application/pdf"],
              required: true,
            },
          ]
        : undefined,
    },
    connections,
    recipes: recipe ? [recipe] : [],
    cronJobs,
    tasks: inferred.needsTaskFallback
      ? [
          {
            title: `Revisar excecoes de ${title}`,
            description: "Task de fallback criada automaticamente para tratar bloqueios ou falhas da automacao.",
            priority: "medium",
            status: "backlog",
          },
        ]
      : [],
    reminders: inferred.needsReminder
      ? [
          {
            message: `Revisar status da automacao ${title}`,
            triggerAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            recurring: "none",
          },
        ]
      : [],
    projectContexts: inferProjectContext(cleanedPrompt, title),
  };
}
