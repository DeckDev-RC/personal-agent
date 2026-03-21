export type ProactivityFrequency = "low" | "balanced" | "high";

export type ProactivitySuggestionType =
  | "tasks"
  | "workflow"
  | "context"
  | "communication"
  | "agenda"
  | "summary";

export type ProactivitySuggestionSurface = "dashboard" | "chat";

export type ProactivitySuggestionPriority = "low" | "medium" | "high";

export type ProactivitySettings = {
  enabled: boolean;
  dashboard: boolean;
  chat: boolean;
  frequency: ProactivityFrequency;
  suggestionTypes: {
    tasks: boolean;
    routines: boolean;
    context: boolean;
    communication: boolean;
  };
};

export type ProactiveSuggestionView =
  | "today"
  | "chat"
  | "notifications"
  | "browser"
  | "workspace"
  | "documents"
  | "agents"
  | "contexts"
  | "tasks"
  | "skills"
  | "workflows"
  | "mcp"
  | "analytics"
  | "logs"
  | "settings";

export type ProactiveSuggestionAction =
  | {
      kind: "prompt";
      prompt: string;
      mode?: "replace_draft" | "append_draft" | "send" | "new_chat";
    }
  | {
      kind: "navigate";
      view: ProactiveSuggestionView;
      param?: string;
    };

export type ProactiveSuggestion = {
  id: string;
  surface: ProactivitySuggestionSurface;
  type: ProactivitySuggestionType;
  priority: ProactivitySuggestionPriority;
  label: string;
  title: string;
  description: string;
  action: ProactiveSuggestionAction;
  reasonTags: string[];
};

export type ProactiveMessageInput = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
  toolName?: string;
  phase?: string;
};

export type ProactiveAgendaInput = {
  id: string;
  title: string;
  timeLabel: string;
  done: boolean;
  createdAt: number;
};

export type ProactiveSuggestionQuery =
  | {
      surface: "dashboard";
      activeContextId?: string;
      manualAgenda?: ProactiveAgendaInput[];
    }
  | {
      surface: "chat";
      currentAgentId?: string;
      projectContextId?: string;
      draft?: string;
      messages?: ProactiveMessageInput[];
    };
