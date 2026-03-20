import type { AgentConfig, AgentSuggestion, AgentSuggestionCategory } from "../../src/types/agent.js";
import { listAgentsV2 } from "./v2EntityStore.js";

type AgentProfile = {
  category: AgentSuggestionCategory;
  keywords: string[];
};

type ScoredAgent = {
  agent: AgentConfig;
  score: number;
  category: AgentSuggestionCategory;
  matchedKeywords: string[];
};

const PROFILE_BY_AGENT_ID: Record<string, AgentProfile> = {
  "cowork-pm-assistant": {
    category: "pm",
    keywords: [
      "backlog",
      "deadline",
      "deliverable",
      "estimate",
      "milestone",
      "planning",
      "priority",
      "prioritization",
      "project status",
      "retrospective",
      "roadmap",
      "sprint",
      "stakeholder",
      "standup",
      "status update",
      "story",
      "task",
      "timeline",
    ],
  },
  "cowork-communication-assistant": {
    category: "communication",
    keywords: [
      "announcement",
      "draft",
      "email",
      "follow up",
      "follow-up",
      "message",
      "reply",
      "respond",
      "slack",
      "subject line",
      "teams",
      "tone",
      "wording",
      "write",
    ],
  },
  "cowork-research-assistant": {
    category: "research",
    keywords: [
      "analyze",
      "analysis",
      "article",
      "benchmark",
      "compare",
      "comparison",
      "document",
      "investigate",
      "market",
      "pdf",
      "report",
      "research",
      "source",
      "summary",
      "summarize",
      "web",
    ],
  },
  "cowork-technical-assistant": {
    category: "technical",
    keywords: [
      "api",
      "bug",
      "code",
      "debug",
      "diff",
      "fix",
      "implementation",
      "pr",
      "pull request",
      "refactor",
      "repo",
      "review",
      "stack trace",
      "test",
      "typescript",
    ],
  },
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "need",
  "help",
  "about",
  "para",
  "com",
  "uma",
  "uns",
  "uma",
  "das",
  "dos",
  "que",
  "como",
  "sobre",
  "mais",
  "less",
  "work",
  "agent",
  "assistant",
  "assistente",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function matchProfileKeywords(prompt: string, keywords: string[]): string[] {
  const normalizedPrompt = normalizeText(prompt);
  const promptTokens = new Set(tokenize(prompt));
  const matches: string[] = [];

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
      continue;
    }

    const matched = normalizedKeyword.includes(" ")
      ? normalizedPrompt.includes(normalizedKeyword)
      : promptTokens.has(normalizedKeyword);

    if (matched) {
      matches.push(keyword);
    }
  }

  return unique(matches);
}

function inferGenericKeywords(agent: AgentConfig): string[] {
  return unique([
    ...tokenize(agent.name),
    ...tokenize(agent.description),
  ]).slice(0, 12);
}

function scoreAgent(agent: AgentConfig, prompt: string): ScoredAgent {
  const profile = PROFILE_BY_AGENT_ID[agent.id];
  const genericKeywords = inferGenericKeywords(agent);
  const profileMatches = profile ? matchProfileKeywords(prompt, profile.keywords) : [];
  const genericMatches = matchProfileKeywords(prompt, genericKeywords);
  const matchedKeywords = unique([...profileMatches, ...genericMatches]).slice(0, 6);

  const score =
    profileMatches.length * 4 +
    genericMatches.length * 2 +
    (profileMatches.length > 0 ? 2 : 0);

  return {
    agent,
    score,
    category: profile?.category ?? "generic",
    matchedKeywords,
  };
}

function scoreToConfidence(score: number): AgentSuggestion["confidence"] {
  if (score >= 10) {
    return "high";
  }
  if (score >= 6) {
    return "medium";
  }
  return "low";
}

export async function suggestAgentForPrompt(params: {
  prompt: string;
  currentAgentId?: string;
  agents?: AgentConfig[];
}): Promise<AgentSuggestion | null> {
  const normalizedPrompt = normalizeText(params.prompt);
  if (normalizedPrompt.length < 12 || normalizedPrompt.split(/\s+/).length < 2) {
    return null;
  }

  const agents = (params.agents ?? (await listAgentsV2())).filter((agent) => agent.id !== "__default__");
  if (agents.length === 0) {
    return null;
  }

  const ranked = agents
    .map((agent) => scoreAgent(agent, normalizedPrompt))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.agent.name.localeCompare(right.agent.name));

  const best = ranked[0];
  if (!best) {
    return null;
  }

  if (best.agent.id === params.currentAgentId) {
    return null;
  }

  const meaningfulScore = best.matchedKeywords.length > 0 ? best.score >= 4 : best.score >= 6;
  if (!meaningfulScore) {
    return null;
  }

  return {
    agentId: best.agent.id,
    agentName: best.agent.name,
    score: best.score,
    confidence: scoreToConfidence(best.score),
    category: best.category,
    matchedKeywords: best.matchedKeywords,
  };
}
