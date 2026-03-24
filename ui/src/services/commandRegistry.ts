import type { TFunction } from "i18next";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BellRing,
  Bot,
  CirclePlay,
  FileSearch,
  FileStack,
  FolderOpen,
  FolderTree,
  GitBranch,
  Globe,
  Inbox,
  Languages,
  LayoutDashboard,
  ListTodo,
  Mail,
  MessageSquare,
  Package,
  Plug,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import type { RouteView } from "../router";
import type { AgentConfig } from "../stores/agentStore";
import type { ConversationSummary } from "../stores/chatStore";
import type { AppSettings } from "../../../src/settings/appSettings.js";
import type { ProjectContext } from "../../../src/types/projectContext.js";
import type { Skill } from "../stores/skillStore";
import type { Workflow } from "../stores/workflowStore";

export type CommandPaletteCommand = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: string;
  keywords?: string[];
  action: () => void | Promise<void>;
};

type CommandRegistryParams = {
  t: TFunction;
  query: string;
  agents: AgentConfig[];
  skills: Skill[];
  workflows: Workflow[];
  contexts: ProjectContext[];
  conversations: ConversationSummary[];
  settings: AppSettings;
  activeContextId: string;
  navigate: (view: RouteView, param?: string) => void;
  startNewChat: () => void;
  switchLanguage: () => void;
  startAgentChat: (agent: AgentConfig) => void;
  startSkillChat: (skill: Skill) => void;
  activateContext: (contextId: string) => void;
  runWorkflow: (workflowId: string) => Promise<void> | void;
  searchKnowledge: (query: string) => Promise<void> | void;
  createTask: (title: string) => Promise<void> | void;
  openSession: (sessionId: string) => void;
};

function normalizeQuery(value: string): string {
  return value.trim();
}

function staticNavigationCommands(params: CommandRegistryParams): CommandPaletteCommand[] {
  const { t, navigate, startNewChat, switchLanguage } = params;

  const navEntries: Array<{
    id: string;
    label: string;
    description: string;
    icon: LucideIcon;
    view?: RouteView;
    action?: () => void | Promise<void>;
    keywords?: string[];
  }> = [
    {
      id: "nav-today",
      label: t("commandPalette.openToday", "Abrir Hoje"),
      description: t("commandPalette.openTodayDesc", "Ir para o dashboard do dia."),
      icon: LayoutDashboard,
      view: "today",
      keywords: ["dashboard", "home", "agenda"],
    },
    {
      id: "nav-chat",
      label: t("commandPalette.openChat", "Abrir Chat"),
      description: t("commandPalette.openChatDesc", "Ir para a conversa atual."),
      icon: MessageSquare,
      view: "chat",
      keywords: ["conversation", "messages"],
    },
    {
      id: "nav-notifications",
      label: t("commandPalette.openNotifications", "Abrir Notificacoes"),
      description: t("commandPalette.openNotificationsDesc", "Ver lembretes e notificacoes."),
      icon: BellRing,
      view: "notifications",
      keywords: ["reminders", "alerts"],
    },
    {
      id: "nav-inbox",
      label: t("commandPalette.openInbox", "Abrir Inbox"),
      description: t("commandPalette.openInboxDesc", "Ver a caixa de entrada unificada dos MCPs conectados."),
      icon: Inbox,
      view: "inbox",
      keywords: ["inbox", "messages", "gmail", "telegram", "discord"],
    },
    {
      id: "nav-workspace",
      label: t("commandPalette.openWorkspace", "Abrir Workspace"),
      description: t("commandPalette.openWorkspaceDesc", "Explorar arquivos organizados do cowork."),
      icon: FolderTree,
      view: "workspace",
      keywords: ["files", "documents"],
    },
    {
      id: "nav-browser",
      label: t("commandPalette.openBrowser", "Abrir Browser"),
      description: t("commandPalette.openBrowserDesc", "Abrir web recipes e automacoes web."),
      icon: Globe,
      view: "browser",
      keywords: ["recipes", "web"],
    },
    {
      id: "nav-documents",
      label: t("commandPalette.openDocuments", "Abrir Documentos"),
      description: t("commandPalette.openDocumentsDesc", "Gerar documentos a partir de templates."),
      icon: FileStack,
      view: "documents",
      keywords: ["templates", "proposal", "minutes"],
    },
    {
      id: "nav-knowledge",
      label: t("commandPalette.openKnowledge", "Abrir Conhecimento"),
      description: t("commandPalette.openKnowledgeDesc", "Pesquisar a base de conhecimento."),
      icon: Search,
      view: "knowledge",
      keywords: ["memory", "search", "semantic"],
    },
    {
      id: "nav-agents",
      label: t("commandPalette.openAgents", "Abrir Agentes"),
      description: t("commandPalette.openAgentsDesc", "Gerenciar agentes especializados."),
      icon: Bot,
      view: "agents",
      keywords: ["assistants"],
    },
    {
      id: "nav-contexts",
      label: t("commandPalette.openContexts", "Abrir Contextos"),
      description: t("commandPalette.openContextsDesc", "Editar contextos de projeto."),
      icon: FolderOpen,
      view: "contexts",
      keywords: ["project", "client"],
    },
    {
      id: "nav-tasks",
      label: t("commandPalette.openTasks", "Abrir Tarefas"),
      description: t("commandPalette.openTasksDesc", "Ver o quadro kanban e a lista de tarefas."),
      icon: ListTodo,
      view: "tasks",
      keywords: ["kanban", "todo"],
    },
    {
      id: "nav-skills",
      label: t("commandPalette.openSkills", "Abrir Skills"),
      description: t("commandPalette.openSkillsDesc", "Gerenciar skills e quick actions."),
      icon: Zap,
      view: "skills",
      keywords: ["quick actions", "prompts"],
    },
    {
      id: "nav-workflows",
      label: t("commandPalette.openWorkflows", "Abrir Workflows"),
      description: t("commandPalette.openWorkflowsDesc", "Ver e executar workflows."),
      icon: GitBranch,
      view: "workflows",
      keywords: ["automation", "schedule"],
    },
    {
      id: "nav-communication",
      label: t("commandPalette.openCommunication", "Abrir Comunicação"),
      description: t("commandPalette.openCommunicationDesc", "Rascunhos, emails e mensagens."),
      icon: Mail,
      view: "communication" as RouteView,
      keywords: ["email", "drafts", "messages", "slack"],
    },
    {
      id: "nav-automation",
      label: t("commandPalette.openAutomation", "Abrir Automação"),
      description: t("commandPalette.openAutomationDesc", "Gerenciar cron jobs e tarefas agendadas."),
      icon: Timer,
      view: "automation" as RouteView,
      keywords: ["cron", "schedule", "timer", "recurring"],
    },
    {
      id: "nav-plugins",
      label: t("commandPalette.openPlugins", "Abrir Plugins"),
      description: t("commandPalette.openPluginsDesc", "Instalar e gerenciar plugins e extensões."),
      icon: Package,
      view: "plugins" as RouteView,
      keywords: ["extensions", "marketplace", "addons"],
    },
    {
      id: "nav-mcp",
      label: t("commandPalette.openMcp", "Abrir MCPs"),
      description: t("commandPalette.openMcpDesc", "Conectar integracoes e servidores MCP."),
      icon: Plug,
      view: "mcp",
      keywords: ["integrations", "slack", "gmail"],
    },
    {
      id: "nav-analytics",
      label: t("commandPalette.openAnalytics", "Abrir Analytics"),
      description: t("commandPalette.openAnalyticsDesc", "Ver uso e produtividade."),
      icon: BarChart3,
      view: "analytics",
      keywords: ["metrics", "usage"],
    },
    {
      id: "nav-logs",
      label: t("commandPalette.openLogs", "Abrir Logs"),
      description: t("commandPalette.openLogsDesc", "Inspecionar logs e execucoes recentes."),
      icon: ScrollText,
      view: "logs",
      keywords: ["history", "events"],
    },
    {
      id: "nav-settings",
      label: t("commandPalette.openSettings", "Abrir Configuracoes"),
      description: t("commandPalette.openSettingsDesc", "Ajustar provider, idioma e comportamento."),
      icon: Settings,
      view: "settings",
      keywords: ["preferences", "config"],
    },
    {
      id: "action-new-chat",
      label: t("commandPalette.newChat", "Novo Chat"),
      description: t("commandPalette.newChatDesc", "Comecar uma nova conversa."),
      icon: MessageSquare,
      action: startNewChat,
      keywords: ["compose", "conversation"],
    },
    {
      id: "action-switch-language",
      label: t("commandPalette.switchLanguage", "Trocar idioma"),
      description: t("commandPalette.switchLanguageDesc", "Alternar o idioma da interface."),
      icon: Languages,
      action: switchLanguage,
      keywords: ["locale", "language"],
    },
  ];

  return navEntries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    description: entry.description,
    icon: entry.icon,
    group: t("commandPalette.groups.navigation", "Navegacao"),
    keywords: entry.keywords,
    action: entry.action ?? (() => navigate(entry.view!)),
  }));
}

function queryCommands(params: CommandRegistryParams): CommandPaletteCommand[] {
  const { t, query, searchKnowledge, createTask } = params;
  const normalized = normalizeQuery(query);
  if (normalized.length < 3) {
    return [];
  }

  return [
    {
      id: `query-search-${normalized}`,
      label: t("commandPalette.querySearch", `Buscar conhecimento: "${normalized}"`),
      description: t("commandPalette.querySearchDesc", "Executar busca direta na base de conhecimento."),
      icon: FileSearch,
      group: t("commandPalette.groups.query", "Consulta"),
      keywords: ["knowledge", "search", "semantic"],
      action: () => searchKnowledge(normalized),
    },
    {
      id: `query-task-${normalized}`,
      label: t("commandPalette.queryTask", `Criar tarefa: "${normalized}"`),
      description: t("commandPalette.queryTaskDesc", "Criar uma nova tarefa a partir do texto digitado."),
      icon: Sparkles,
      group: t("commandPalette.groups.query", "Consulta"),
      keywords: ["task", "todo", "capture"],
      action: () => createTask(normalized),
    },
  ];
}

function agentCommands(params: CommandRegistryParams): CommandPaletteCommand[] {
  const { t, agents, startAgentChat } = params;
  return agents.map((agent) => ({
    id: `agent-${agent.id}`,
    label: t("commandPalette.startWithAgent", `Iniciar com agente: ${agent.name}`),
    description: agent.description || t("commandPalette.startWithAgentDesc", "Abrir uma nova conversa com este agente."),
    icon: Bot,
    group: t("commandPalette.groups.agents", "Agentes"),
    keywords: [agent.name, agent.description],
    action: () => startAgentChat(agent),
  }));
}

function skillCommands(params: CommandRegistryParams): CommandPaletteCommand[] {
  const { t, skills, startSkillChat } = params;
  return skills
    .filter((skill) => skill.type === "prompt")
    .sort((left, right) => {
      const leftQuick = left.tags.includes("quick-action") ? 0 : 1;
      const rightQuick = right.tags.includes("quick-action") ? 0 : 1;
      return leftQuick - rightQuick || left.name.localeCompare(right.name);
    })
    .map((skill) => ({
      id: `skill-${skill.id}`,
      label: t("commandPalette.runSkill", `Executar skill: ${skill.name}`),
      description: skill.description || t("commandPalette.runSkillDesc", "Abrir uma conversa pronta com esta skill."),
      icon: skill.tags.includes("quick-action") ? Sparkles : Zap,
      group: skill.tags.includes("quick-action")
        ? t("commandPalette.groups.quickActions", "Quick Actions")
        : t("commandPalette.groups.skills", "Skills"),
      keywords: [skill.name, skill.description, ...skill.tags],
      action: () => startSkillChat(skill),
    }));
}

function workflowCommands(params: CommandRegistryParams): CommandPaletteCommand[] {
  const { t, workflows, runWorkflow } = params;
  return workflows.map((workflow) => ({
    id: `workflow-${workflow.id}`,
    label: t("commandPalette.runWorkflow", `Executar workflow: ${workflow.name}`),
    description: workflow.description || t("commandPalette.runWorkflowDesc", "Executar o workflow agora."),
    icon: CirclePlay,
    group: t("commandPalette.groups.workflows", "Workflows"),
    keywords: [workflow.name, workflow.description],
    action: () => runWorkflow(workflow.id),
  }));
}

function contextCommands(params: CommandRegistryParams): CommandPaletteCommand[] {
  const { t, contexts, activeContextId, activateContext } = params;
  return contexts.map((projectContext) => ({
    id: `context-${projectContext.id}`,
    label:
      projectContext.id === activeContextId
        ? t("commandPalette.activeContext", `Contexto ativo: ${projectContext.name}`)
        : t("commandPalette.activateContext", `Ativar contexto: ${projectContext.name}`),
    description:
      projectContext.description ||
      t("commandPalette.activateContextDesc", "Definir este contexto como padrao global."),
    icon: FolderOpen,
    group: t("commandPalette.groups.contexts", "Contextos"),
    keywords: [projectContext.name, projectContext.description, ...projectContext.stakeholders],
    action: () => activateContext(projectContext.id),
  }));
}

function recentSessionCommands(params: CommandRegistryParams): CommandPaletteCommand[] {
  const { t, conversations, openSession } = params;
  return conversations.slice(0, 6).map((conversation) => ({
    id: `session-${conversation.id}`,
    label: t("commandPalette.openSession", `Abrir sessao: ${conversation.title}`),
    description: t(
      "commandPalette.openSessionDesc",
      `Mensagens: ${conversation.messageCount} · Atualizada ${new Date(conversation.updatedAt).toLocaleString()}`,
    ),
    icon: MessageSquare,
    group: t("commandPalette.groups.recents", "Recentes"),
    keywords: [conversation.title, conversation.projectContextId, conversation.agentId],
    action: () => openSession(conversation.id),
  }));
}

export function buildCommandRegistry(params: CommandRegistryParams): CommandPaletteCommand[] {
  return [
    ...queryCommands(params),
    ...staticNavigationCommands(params),
    ...recentSessionCommands(params),
    ...agentCommands(params),
    ...skillCommands(params),
    ...workflowCommands(params),
    ...contextCommands(params),
  ];
}

function scoreText(value: string | undefined, query: string): number {
  const normalizedValue = String(value ?? "").toLowerCase();
  const normalizedQuery = normalizeQuery(query).toLowerCase();

  if (!normalizedValue || !normalizedQuery) {
    return 0;
  }
  if (normalizedValue === normalizedQuery) {
    return 1000;
  }
  if (normalizedValue.startsWith(normalizedQuery)) {
    return 700 - normalizedValue.length;
  }

  const substringIndex = normalizedValue.indexOf(normalizedQuery);
  if (substringIndex >= 0) {
    return 500 - substringIndex;
  }

  let score = 0;
  let cursor = 0;
  for (const char of normalizedQuery) {
    const index = normalizedValue.indexOf(char, cursor);
    if (index === -1) {
      return 0;
    }
    score += index === cursor ? 20 : 8;
    cursor = index + 1;
  }

  return score;
}

export function scoreCommand(command: CommandPaletteCommand, query: string): number {
  const scores = [
    scoreText(command.label, query),
    scoreText(command.description, query) - 80,
    ...(command.keywords ?? []).map((keyword) => scoreText(keyword, query) - 40),
    scoreText(command.group, query) - 120,
  ];

  return Math.max(...scores, 0);
}
