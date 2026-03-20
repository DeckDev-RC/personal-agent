import React, { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Languages, Mail, Search, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { Skill } from "../../stores/skillStore";
import { useSkillStore } from "../../stores/skillStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useChatStore } from "../../stores/chatStore";
import { useContextStore } from "../../stores/contextStore";
import { DEFAULT_AGENT } from "../../stores/agentStore";
import { setRoute } from "../../router";

const MAX_QUICK_ACTIONS = 6;
const QUICK_ACTION_ORDER = [
  "cowork-professional-email-writer",
  "cowork-meeting-summarizer",
  "cowork-web-researcher",
  "cowork-text-reviewer",
  "cowork-daily-standup-generator",
  "cowork-document-analyzer",
  "cowork-sprint-planner",
  "cowork-contextual-translator",
  "cowork-proposal-generator",
  "cowork-code-review-assistant",
];

function skillOrder(skillId: string): number {
  const index = QUICK_ACTION_ORDER.indexOf(skillId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function iconForSkill(skill: Skill) {
  const tags = new Set(skill.tags);
  if (tags.has("email")) return Mail;
  if (tags.has("translation")) return Languages;
  if (tags.has("research")) return Search;
  if (tags.has("review")) return ShieldCheck;
  if (tags.has("documents") || tags.has("proposal")) return FileText;
  if (tags.has("standup")) return Sparkles;
  return Zap;
}

function buildQuickActionPrompt(skill: Skill, globalSystemPrompt: string): string {
  const sections = [DEFAULT_AGENT.systemPrompt];

  if (globalSystemPrompt.trim()) {
    sections.push(`Global instructions:\n${globalSystemPrompt.trim()}`);
  }

  sections.push(`## Skill: ${skill.name}\n${skill.content.trim()}`);
  return sections.join("\n\n---\n\n");
}

type QuickActionsProps = {
  onAction?: () => void;
};

export default function QuickActions({ onAction }: QuickActionsProps) {
  const { t } = useTranslation();
  const { skills, loaded, loadSkills } = useSkillStore();
  const settings = useSettingsStore((state) => state.settings);
  const activeContextId = useContextStore((state) => state.activeContextId);
  const createConversation = useChatStore((state) => state.createConversation);

  useEffect(() => {
    if (!loaded) {
      void loadSkills();
    }
  }, [loaded, loadSkills]);

  const quickActions = useMemo(
    () =>
      skills
        .filter((skill) => skill.type === "prompt" && skill.tags.includes("quick-action"))
        .sort((left, right) => skillOrder(left.id) - skillOrder(right.id))
        .slice(0, MAX_QUICK_ACTIONS),
    [skills],
  );

  if (quickActions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] uppercase tracking-wider text-text-secondary/50 px-2 pt-3 pb-0.5 select-none">
        {t("skills.quickActions")}
      </span>

      {quickActions.map((skill) => {
        const Icon = iconForSkill(skill);
        return (
          <button
            key={skill.id}
            onClick={() => {
              createConversation(
                settings.defaultModelRef,
                buildQuickActionPrompt(skill, settings.globalSystemPrompt),
                DEFAULT_AGENT.id,
                activeContextId || undefined,
              );
              setRoute("chat");
              onAction?.();
            }}
            className="flex items-start gap-2 rounded-lg px-2 py-2 text-left text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary cursor-pointer"
            title={skill.description || skill.name}
          >
            <Icon size={15} className="mt-0.5 shrink-0 text-accent-orange" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-text-primary truncate">{skill.name}</div>
              {skill.description && (
                <div className="mt-0.5 text-[10px] leading-snug text-text-secondary/65 line-clamp-2">
                  {skill.description}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
