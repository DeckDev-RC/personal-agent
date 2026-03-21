import type { McpServerConfig, McpServerStatus } from "../../src/types/mcp.js";
import type {
  ProactiveAgendaInput,
  ProactiveMessageInput,
  ProactiveSuggestion,
  ProactiveSuggestionQuery,
} from "../../src/types/proactive.js";
import type { ProjectContext } from "../../src/types/projectContext.js";
import type { ReminderRecord } from "../../src/types/reminder.js";
import type { SessionRecord } from "../../src/types/runtime.js";
import type { TaskRecord } from "../../src/types/task.js";
import type { Workflow } from "../../src/types/workflow.js";
import * as mcpManager from "./mcpManager.js";
import { listReminders } from "./reminderScheduler.js";
import { listTasks } from "./taskManager.js";
import {
  getSettingsV2,
  listMcpServersV2,
  listProjectContextsV2,
  listWorkflowsV2,
  type V2AppSettings,
} from "./v2EntityStore.js";
import { listSessionRecords } from "./v2SessionStore.js";

type ProactiveSnapshot = {
  now: number;
  settings: V2AppSettings;
  tasks: TaskRecord[];
  reminders: ReminderRecord[];
  contexts: ProjectContext[];
  workflows: Workflow[];
  sessions: SessionRecord[];
  mcpStatuses: McpServerStatus[];
  mcpServers: McpServerConfig[];
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function parseDueDate(dueDate?: string): number | null {
  if (!dueDate?.trim()) {
    return null;
  }
  const timestamp = Date.parse(`${dueDate}T00:00:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseAgendaTimestamp(now: number, item: ProactiveAgendaInput): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(item.timeLabel.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

function uniqueById(items: ProactiveSuggestion[]): ProactiveSuggestion[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function connectedCatalogIds(snapshot: ProactiveSnapshot): Set<string> {
  const connectedServerIds = new Set(
    snapshot.mcpStatuses.filter((status) => status.connected).map((status) => status.id),
  );

  return new Set(
    snapshot.mcpServers
      .filter((server) => connectedServerIds.has(server.id) && server.catalogId)
      .map((server) => String(server.catalogId)),
  );
}

function isWorkdayMorning(now: number): boolean {
  const date = new Date(now);
  const day = date.getDay();
  return day >= 1 && day <= 5 && date.getHours() < 11;
}

function isWorkdayLate(now: number): boolean {
  const date = new Date(now);
  const day = date.getDay();
  return day >= 1 && day <= 5 && date.getHours() >= 16;
}

function limitForFrequency(settings: V2AppSettings): number {
  switch (settings.proactivity.frequency) {
    case "low":
      return 2;
    case "high":
      return 6;
    default:
      return 4;
  }
}

function activeContext(snapshot: ProactiveSnapshot, contextId?: string): ProjectContext | undefined {
  if (!contextId) {
    return undefined;
  }
  return snapshot.contexts.find((projectContext) => projectContext.id === contextId);
}

function taskTitles(tasks: TaskRecord[], limit = 3): string {
  return tasks.slice(0, limit).map((task) => task.title).join(", ");
}

function recentContextSession(snapshot: ProactiveSnapshot, contextId?: string): SessionRecord | undefined {
  if (!contextId) {
    return undefined;
  }

  return snapshot.sessions.find((session) => session.projectContextId === contextId);
}

function buildDashboardSuggestions(
  query: Extract<ProactiveSuggestionQuery, { surface: "dashboard" }>,
  snapshot: ProactiveSnapshot,
): ProactiveSuggestion[] {
  if (!snapshot.settings.proactivity.enabled || !snapshot.settings.proactivity.dashboard) {
    return [];
  }

  const suggestions: ProactiveSuggestion[] = [];
  const todayStart = startOfDay(snapshot.now);
  const activeProjectContext = activeContext(snapshot, query.activeContextId);
  const scopedTasks = query.activeContextId
    ? snapshot.tasks.filter((task) => task.projectContextId === query.activeContextId)
    : snapshot.tasks;
  const openTasks = scopedTasks.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => {
    const dueAt = parseDueDate(task.dueDate);
    return dueAt != null && dueAt < todayStart;
  });
  const dueTodayTasks = openTasks.filter((task) => parseDueDate(task.dueDate) === todayStart);
  const connectedCatalogs = connectedCatalogIds(snapshot);
  const manualAgenda = (query.manualAgenda ?? []).filter((item) => !item.done);
  const nextAgendaItem = manualAgenda
    .map((item) => ({ item, timestamp: parseAgendaTimestamp(snapshot.now, item) }))
    .filter((entry): entry is { item: ProactiveAgendaInput; timestamp: number } => entry.timestamp != null)
    .filter((entry) => entry.timestamp >= snapshot.now && entry.timestamp <= snapshot.now + 90 * 60 * 1000)
    .sort((left, right) => left.timestamp - right.timestamp)[0];
  const pendingReminder = snapshot.reminders.find(
    (reminder) =>
      reminder.status === "pending" &&
      reminder.triggerAt >= snapshot.now &&
      reminder.triggerAt <= snapshot.now + 2 * 60 * 60 * 1000,
  );
  const lastContextSession = recentContextSession(snapshot, query.activeContextId);
  const lastContextTouchIsStale = lastContextSession
    ? lastContextSession.updatedAt < snapshot.now - 24 * 60 * 60 * 1000
    : Boolean(query.activeContextId);

  if (snapshot.settings.proactivity.suggestionTypes.tasks && overdueTasks.length > 0) {
    suggestions.push({
      id: "dashboard-overdue-tasks",
      surface: "dashboard",
      type: "tasks",
      priority: "high",
      label: "Priorizar atrasadas",
      title: `${overdueTasks.length} tarefa(s) atrasada(s) precisam de decisao`,
      description: `Monte um plano curto para recuperar prazo e definir o proximo movimento para ${taskTitles(overdueTasks)}.`,
      action: {
        kind: "prompt",
        mode: "new_chat",
        prompt: `Ajude-me a priorizar ${overdueTasks.length} tarefas atrasadas e montar um plano de recuperacao. Considere contexto, impacto e proximos passos.\n\nTarefas:\n- ${overdueTasks.map((task) => task.title).join("\n- ")}`,
      },
      reasonTags: ["tasks", "deadlines"],
    });
  }

  if (
    snapshot.settings.proactivity.suggestionTypes.tasks &&
    dueTodayTasks.length > 0 &&
    openTasks.every((task) => task.status !== "in_progress")
  ) {
    suggestions.push({
      id: "dashboard-focus-plan",
      surface: "dashboard",
      type: "tasks",
      priority: "medium",
      label: "Plano do dia",
      title: "Transformar tarefas de hoje em um foco claro",
      description: `${dueTodayTasks.length} tarefa(s) vencem hoje. Gere uma ordem de execucao e riscos antes de comecar.`,
      action: {
        kind: "prompt",
        mode: "new_chat",
        prompt: `Monte meu plano de foco para hoje a partir destas tarefas.\n\nTarefas com vencimento hoje:\n- ${dueTodayTasks.map((task) => task.title).join("\n- ")}`,
      },
      reasonTags: ["focus", "today"],
    });
  }

  if (snapshot.settings.proactivity.suggestionTypes.routines && isWorkdayMorning(snapshot.now)) {
    const workflow = snapshot.workflows.find((entry) => entry.id === "cowork-morning-briefing");
    if (workflow) {
      suggestions.push({
        id: "dashboard-morning-briefing",
        surface: "dashboard",
        type: "workflow",
        priority: "medium",
        label: "Morning briefing",
        title: "Comecar o dia com um briefing rapido",
        description: "Use o workflow de morning briefing para juntar tarefas, memoria recente e ferramentas conectadas.",
        action: {
          kind: "navigate",
          view: "workflows",
        },
        reasonTags: ["routine", "morning"],
      });
    }
  }

  if (snapshot.settings.proactivity.suggestionTypes.routines && isWorkdayLate(snapshot.now)) {
    const workflow = snapshot.workflows.find((entry) => entry.id === "cowork-end-of-day-report");
    if (workflow && openTasks.length > 0) {
      suggestions.push({
        id: "dashboard-end-of-day",
        surface: "dashboard",
        type: "workflow",
        priority: "medium",
        label: "Fechar o dia",
        title: "Preparar um end-of-day report antes de encerrar",
        description: "Resuma progresso, decisoes e follow-ups enquanto o contexto ainda esta fresco.",
        action: {
          kind: "navigate",
          view: "workflows",
        },
        reasonTags: ["routine", "handoff"],
      });
    }
  }

  if (snapshot.settings.proactivity.suggestionTypes.context && !query.activeContextId && snapshot.contexts.length > 0) {
    suggestions.push({
      id: "dashboard-select-context",
      surface: "dashboard",
      type: "context",
      priority: "medium",
      label: "Selecionar contexto",
      title: "Ative um contexto de projeto antes de continuar",
      description: "Isso melhora memoria, sugestoes e prompts automaticos ao longo do dia.",
      action: {
        kind: "navigate",
        view: "contexts",
      },
      reasonTags: ["context"],
    });
  }

  if (
    snapshot.settings.proactivity.suggestionTypes.context &&
    activeProjectContext &&
    lastContextTouchIsStale &&
    openTasks.length > 0
  ) {
    suggestions.push({
      id: "dashboard-resume-context",
      surface: "dashboard",
      type: "context",
      priority: "medium",
      label: "Retomar contexto",
      title: `Retomar ${activeProjectContext.name}`,
      description: "Existe trabalho aberto nesse contexto e pouca atividade recente. Vale pedir um status antes de seguir.",
      action: {
        kind: "prompt",
        mode: "new_chat",
        prompt: `Recapitule o contexto do projeto "${activeProjectContext.name}" e proponha o proximo passo mais util com base nas tarefas abertas e na atividade recente.`,
      },
      reasonTags: ["context", "status"],
    });
  }

  if (snapshot.settings.proactivity.suggestionTypes.routines && nextAgendaItem) {
    suggestions.push({
      id: "dashboard-next-agenda",
      surface: "dashboard",
      type: "agenda",
      priority: "high",
      label: "Preparar proximo bloco",
      title: `Proximo compromisso: ${nextAgendaItem.item.title}`,
      description: "O item mais proximo da agenda manual esta chegando. Prepare notas, objetivos ou um briefing curto agora.",
      action: {
        kind: "prompt",
        mode: "new_chat",
        prompt: `Prepare um briefing rapido para este compromisso.\n\nItem: ${nextAgendaItem.item.title}\nHorario: ${nextAgendaItem.item.timeLabel}`,
      },
      reasonTags: ["agenda", "meeting"],
    });
  }

  if (snapshot.settings.proactivity.suggestionTypes.routines && pendingReminder) {
    suggestions.push({
      id: "dashboard-upcoming-reminder",
      surface: "dashboard",
      type: "agenda",
      priority: "medium",
      label: "Antecipar lembrete",
      title: "Ha um lembrete importante para as proximas horas",
      description: pendingReminder.message,
      action: {
        kind: "prompt",
        mode: "new_chat",
        prompt: `Ajude-me a me preparar para este lembrete que vai disparar em breve: "${pendingReminder.message}".`,
      },
      reasonTags: ["reminder", "agenda"],
    });
  }

  if (
    snapshot.settings.proactivity.suggestionTypes.communication &&
    !connectedCatalogs.has("slack") &&
    !connectedCatalogs.has("gmail") &&
    !connectedCatalogs.has("google-calendar")
  ) {
    suggestions.push({
      id: "dashboard-connect-mcp",
      surface: "dashboard",
      type: "communication",
      priority: "low",
      label: "Conectar ferramentas",
      title: "Conectar Slack, Gmail ou Calendar destrava o modo cowork completo",
      description: "Sem integracoes de comunicacao ativas, o agente depende apenas de dados locais.",
      action: {
        kind: "navigate",
        view: "mcp",
      },
      reasonTags: ["mcp", "communication"],
    });
  }

  if (
    snapshot.settings.proactivity.suggestionTypes.communication &&
    activeProjectContext?.stakeholders.length
  ) {
    suggestions.push({
      id: "dashboard-stakeholder-update",
      surface: "dashboard",
      type: "communication",
      priority: "low",
      label: "Atualizacao para stakeholders",
      title: "Rascunhar um update curto para stakeholders",
      description: `Use o contexto ativo para preparar uma comunicacao objetiva para ${activeProjectContext.stakeholders[0]}.`,
      action: {
        kind: "prompt",
        mode: "new_chat",
        prompt: `Escreva uma atualizacao curta para stakeholders sobre o projeto "${activeProjectContext.name}". Use tom profissional e destaque progresso, riscos e proximo passo.`,
      },
      reasonTags: ["communication", "stakeholders"],
    });
  }

  return suggestions;
}

function buildCommunicationChatSuggestions(
  draft: string,
  basePrompt: string,
): ProactiveSuggestion[] {
  return [
    {
      id: "chat-email-professional",
      surface: "chat",
      type: "communication",
      priority: "high",
      label: "Email profissional",
      title: "Transformar em email profissional",
      description: "Completa assunto, corpo e call to action.",
      action: {
        kind: "prompt",
        mode: "replace_draft",
        prompt: `Transforme este pedido em um email profissional com assunto, contexto claro e call to action objetivo.\n\nPedido atual:\n${basePrompt || draft}`,
      },
      reasonTags: ["communication", "email"],
    },
    {
      id: "chat-email-short",
      surface: "chat",
      type: "communication",
      priority: "medium",
      label: "Versao curta",
      title: "Pedir uma versao mais curta",
      description: "Mantem o tom profissional e reduz o texto.",
      action: {
        kind: "prompt",
        mode: "replace_draft",
        prompt: `Reescreva este pedido para gerar uma versao mais curta, direta e executiva.\n\nPedido atual:\n${basePrompt || draft}`,
      },
      reasonTags: ["communication", "concise"],
    },
    {
      id: "chat-email-cta",
      surface: "chat",
      type: "communication",
      priority: "medium",
      label: "Adicionar CTA",
      title: "Forcar proximo passo explicito",
      description: "Deixa a mensagem com deadline ou resposta esperada.",
      action: {
        kind: "prompt",
        mode: "append_draft",
        prompt: "Inclua um call to action claro, com prazo e expectativa de resposta.",
      },
      reasonTags: ["communication", "cta"],
    },
  ];
}

function buildMeetingChatSuggestions(draft: string, basePrompt: string): ProactiveSuggestion[] {
  return [
    {
      id: "chat-meeting-summary",
      surface: "chat",
      type: "summary",
      priority: "high",
      label: "Resumo estruturado",
      title: "Estruturar como resumo de reuniao",
      description: "Organiza em contexto, decisoes, action items e follow-ups.",
      action: {
        kind: "prompt",
        mode: "replace_draft",
        prompt: `Transforme este pedido em um resumo estruturado de reuniao com decisoes, action items e follow-ups.\n\nPedido atual:\n${basePrompt || draft}`,
      },
      reasonTags: ["meeting", "summary"],
    },
    {
      id: "chat-meeting-actions",
      surface: "chat",
      type: "tasks",
      priority: "medium",
      label: "Extrair tasks",
      title: "Pedir somente action items",
      description: "Foca no que precisa ser executado depois.",
      action: {
        kind: "prompt",
        mode: "append_draft",
        prompt: "Extraia action items com dono, prazo e dependencias quando possivel.",
      },
      reasonTags: ["meeting", "tasks"],
    },
    {
      id: "chat-meeting-follow-up",
      surface: "chat",
      type: "communication",
      priority: "medium",
      label: "Virar follow-up",
      title: "Converter em mensagem de follow-up",
      description: "Prepara uma mensagem curta para enviar depois da reuniao.",
      action: {
        kind: "prompt",
        mode: "replace_draft",
        prompt: `Reescreva este pedido para gerar uma mensagem de follow-up de reuniao, curta e profissional.\n\nPedido atual:\n${basePrompt || draft}`,
      },
      reasonTags: ["meeting", "follow-up"],
    },
  ];
}

function buildTaskChatSuggestions(draft: string, basePrompt: string): ProactiveSuggestion[] {
  return [
    {
      id: "chat-task-prioritize",
      surface: "chat",
      type: "tasks",
      priority: "high",
      label: "Priorizar",
      title: "Transformar em decisao de prioridade",
      description: "Pede ordem, impacto e recomendacao de proximo passo.",
      action: {
        kind: "prompt",
        mode: "replace_draft",
        prompt: `Reescreva este pedido para priorizar tarefas, justificar a ordem e propor o proximo passo mais importante.\n\nPedido atual:\n${basePrompt || draft}`,
      },
      reasonTags: ["tasks", "priority"],
    },
    {
      id: "chat-task-checklist",
      surface: "chat",
      type: "tasks",
      priority: "medium",
      label: "Quebrar em checklist",
      title: "Pedir decomposicao em checklist",
      description: "Divide o trabalho em blocos menores e claros.",
      action: {
        kind: "prompt",
        mode: "append_draft",
        prompt: "Quebre o resultado em checklist executavel com proximos passos pequenos e verificaveis.",
      },
      reasonTags: ["tasks", "checklist"],
    },
    {
      id: "chat-task-risk",
      surface: "chat",
      type: "tasks",
      priority: "medium",
      label: "Mapear riscos",
      title: "Adicionar riscos e dependencias",
      description: "Faz a resposta considerar bloqueios e tradeoffs.",
      action: {
        kind: "prompt",
        mode: "append_draft",
        prompt: "Inclua riscos, dependencias e o que pode travar a execucao.",
      },
      reasonTags: ["tasks", "risk"],
    },
  ];
}

function buildConversationFollowUps(
  query: Extract<ProactiveSuggestionQuery, { surface: "chat" }>,
  snapshot: ProactiveSnapshot,
): ProactiveSuggestion[] {
  const latestAssistant = [...(query.messages ?? [])].reverse().find((message) => message.role === "assistant");
  const latestUser = [...(query.messages ?? [])].reverse().find((message) => message.role === "user");
  const activeProjectContext = activeContext(snapshot, query.projectContextId);
  const suggestions: ProactiveSuggestion[] = [];

  if (latestAssistant?.content && latestAssistant.content.length > 220) {
    suggestions.push({
      id: "chat-followup-summary",
      surface: "chat",
      type: "summary",
      priority: "medium",
      label: "Resumir resposta",
      title: "Resumir a ultima resposta",
      description: "Converte a ultima resposta em bullets curtos.",
      action: {
        kind: "prompt",
        mode: "send",
        prompt: "Resuma a ultima resposta em no maximo 5 bullets objetivos.",
      },
      reasonTags: ["summary", "follow-up"],
    });
  }

  if (latestAssistant?.content && /(meeting|reuniao|decision|decisao|action item|follow-up)/i.test(latestAssistant.content)) {
    suggestions.push({
      id: "chat-followup-actions",
      surface: "chat",
      type: "tasks",
      priority: "medium",
      label: "Extrair tasks",
      title: "Extrair tarefas da conversa",
      description: "Transforma a conversa atual em action items.",
      action: {
        kind: "prompt",
        mode: "send",
        prompt: "Extraia tarefas, donos sugeridos e prazos aproximados a partir da conversa atual.",
      },
      reasonTags: ["tasks", "follow-up"],
    });
  }

  if (latestUser?.content && /(email|mensagem|reply|slack|follow-up)/i.test(latestUser.content)) {
    suggestions.push({
      id: "chat-followup-sendable",
      surface: "chat",
      type: "communication",
      priority: "medium",
      label: "Versao enviavel",
      title: "Gerar mensagem pronta para envio",
      description: "Pede uma versao final, curta e pronta para copiar.",
      action: {
        kind: "prompt",
        mode: "send",
        prompt: "Agora transforme isso em uma mensagem final, pronta para enviar, com tom profissional e objetivo.",
      },
      reasonTags: ["communication", "follow-up"],
    });
  }

  if (activeProjectContext) {
    suggestions.push({
      id: "chat-followup-context",
      surface: "chat",
      type: "context",
      priority: "low",
      label: "Atualizar status do contexto",
      title: "Atualizar status do projeto ativo",
      description: "Usa a conversa atual para consolidar status e proximo passo do contexto.",
      action: {
        kind: "prompt",
        mode: "send",
        prompt: `Com base na conversa atual, gere um status curto para o contexto "${activeProjectContext.name}" com progresso, riscos e proximo passo.`,
      },
      reasonTags: ["context", "status"],
    });
  }

  return suggestions;
}

function buildChatSuggestions(
  query: Extract<ProactiveSuggestionQuery, { surface: "chat" }>,
  snapshot: ProactiveSnapshot,
): ProactiveSuggestion[] {
  if (!snapshot.settings.proactivity.enabled || !snapshot.settings.proactivity.chat) {
    return [];
  }

  const draft = query.draft?.trim() ?? "";
  const normalizedDraft = normalizeText(draft);
  const basePrompt =
    draft.length > 0
      ? draft
      : [...(query.messages ?? [])]
          .reverse()
          .find((message) => message.role === "user" || message.role === "assistant")
          ?.content ?? "";

  const suggestions: ProactiveSuggestion[] = [];

  if (draft) {
    if (
      snapshot.settings.proactivity.suggestionTypes.communication &&
      /(email|mail|reply|responder|mensagem|message|slack|teams)/i.test(normalizedDraft)
    ) {
      suggestions.push(...buildCommunicationChatSuggestions(draft, basePrompt));
    }

    if (
      snapshot.settings.proactivity.suggestionTypes.context &&
      /(meeting|reuniao|ata|notes|notas|decision|decisao|follow-up)/i.test(normalizedDraft)
    ) {
      suggestions.push(...buildMeetingChatSuggestions(draft, basePrompt));
    }

    if (
      snapshot.settings.proactivity.suggestionTypes.tasks &&
      /(task|tarefa|backlog|sprint|prioridade|priority|plan|plano|next step|proximo passo)/i.test(normalizedDraft)
    ) {
      suggestions.push(...buildTaskChatSuggestions(draft, basePrompt));
    }

    if (
      suggestions.length === 0 &&
      snapshot.settings.proactivity.suggestionTypes.tasks &&
      draft.length > 40
    ) {
      suggestions.push({
        id: "chat-generic-bullets",
        surface: "chat",
        type: "summary",
        priority: "low",
        label: "Responder em bullets",
        title: "Converter em pedido mais escaneavel",
        description: "Ajuda a obter uma resposta mais objetiva.",
        action: {
          kind: "prompt",
          mode: "append_draft",
          prompt: "Responda em bullets curtos e com proximos passos claros.",
        },
        reasonTags: ["format"],
      });
    }
  } else {
    suggestions.push(...buildConversationFollowUps(query, snapshot));
  }

  return suggestions;
}

export function buildProactiveSuggestions(
  query: ProactiveSuggestionQuery,
  snapshot: ProactiveSnapshot,
): ProactiveSuggestion[] {
  const suggestions =
    query.surface === "dashboard"
      ? buildDashboardSuggestions(query, snapshot)
      : buildChatSuggestions(query, snapshot);

  const priorityWeight = { high: 3, medium: 2, low: 1 } as const;
  return uniqueById(suggestions)
    .sort(
      (left, right) =>
        priorityWeight[right.priority] - priorityWeight[left.priority] ||
        left.title.localeCompare(right.title),
    )
    .slice(0, limitForFrequency(snapshot.settings));
}

async function createSnapshot(): Promise<ProactiveSnapshot> {
  const [
    settings,
    tasks,
    reminders,
    contexts,
    workflows,
    sessions,
    mcpServers,
  ] = await Promise.all([
    getSettingsV2(),
    listTasks({ includeDone: true }),
    listReminders({ includeAcknowledged: true }),
    listProjectContextsV2(),
    listWorkflowsV2(),
    listSessionRecords(),
    listMcpServersV2(),
  ]);

  return {
    now: Date.now(),
    settings,
    tasks,
    reminders,
    contexts,
    workflows,
    sessions,
    mcpStatuses: mcpManager.getAllStatuses(),
    mcpServers,
  };
}

export async function getProactiveSuggestions(query: ProactiveSuggestionQuery): Promise<ProactiveSuggestion[]> {
  return buildProactiveSuggestions(query, await createSnapshot());
}
