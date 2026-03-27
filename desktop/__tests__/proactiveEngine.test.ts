import { describe, expect, it } from "vitest";
import { buildProactiveSuggestions } from "../services/proactiveEngine.js";

const baseSettings = {
  provider: "openai-codex",
  defaultModelRef: "openai-codex/gpt-5.4",
  fastModelRef: "openai-codex/gpt-5.4-mini",
  reviewModelRef: "openai-codex/gpt-5.4",
  defaultModel: "openai-codex/gpt-5.4",
  fastModel: "openai-codex/gpt-5.4-mini",
  reviewModel: "openai-codex/gpt-5.4",
  language: "pt-BR",
  reasoningEffort: "medium",
  planMode: false,
  fastMode: false,
  globalSystemPrompt: "",
  contextWindow: 128000,
  compactAtTokens: 96000,
  maxOutputTokens: 4096,
  webSearch: {
    endpoint: "",
    apiKey: "",
    timeoutMs: 15000,
    maxResults: 5,
  },
  reasoningPolicyByTask: {
    chat_simple: "low",
    plan_research: "medium",
    code_read: "medium",
    code_change: "high",
    command_exec: "medium",
    review_fix: "high",
    tool_invoke: "medium",
  },
  proactivity: {
    enabled: true,
    dashboard: true,
    chat: true,
    frequency: "balanced",
    suggestionTypes: {
      tasks: true,
      routines: true,
      context: true,
      communication: true,
    },
  },
};

describe("proactiveEngine", () => {
  it("suggests overdue task prioritization on the dashboard", () => {
    const suggestions = buildProactiveSuggestions(
      {
        surface: "dashboard",
        activeContextId: "ctx-alpha",
        manualAgenda: [],
      },
      {
        now: Date.parse("2026-03-20T09:00:00Z"),
        settings: baseSettings,
        tasks: [
          {
            id: "task-1",
            title: "Revisar proposta do cliente",
            description: "",
            status: "today",
            priority: "high",
            projectContextId: "ctx-alpha",
            dueDate: "2026-03-19",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        reminders: [],
        contexts: [
          {
            id: "ctx-alpha",
            name: "Projeto Alpha",
            description: "",
            stakeholders: [],
            decisions: [],
            links: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        workflows: [],
        sessions: [],
        mcpStatuses: [],
        mcpServers: [],
      } as any,
    );

    expect(suggestions[0]?.id).toBe("dashboard-overdue-tasks");
    expect(suggestions[0]?.action.kind).toBe("prompt");
  });

  it("generates communication chips from an email-oriented draft", () => {
    const suggestions = buildProactiveSuggestions(
      {
        surface: "chat",
        draft: "Preciso responder este email para o cliente com uma atualizacao do projeto.",
        projectContextId: "ctx-alpha",
        messages: [],
      },
      {
        now: Date.parse("2026-03-20T13:00:00Z"),
        settings: baseSettings,
        tasks: [],
        reminders: [],
        contexts: [],
        workflows: [],
        sessions: [],
        mcpStatuses: [],
        mcpServers: [],
      } as any,
    );

    expect(suggestions.map((item) => item.id)).toContain("chat-email-professional");
    expect(suggestions.map((item) => item.label)).toContain("Email profissional");
  });
});
