import React from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  CheckSquare2,
  FileText,
  GitBranch,
  MessageSquareQuote,
  Sparkles,
} from "lucide-react";
import type { ProactiveSuggestion } from "../../../../src/types/proactive.js";

type SuggestionChipsProps = {
  suggestions: ProactiveSuggestion[];
  onSelect: (suggestion: ProactiveSuggestion) => void;
};

function iconForSuggestion(type: ProactiveSuggestion["type"]): React.ElementType {
  switch (type) {
    case "tasks":
      return CheckSquare2;
    case "workflow":
      return GitBranch;
    case "agenda":
      return CalendarClock;
    case "communication":
      return MessageSquareQuote;
    case "summary":
      return FileText;
    default:
      return Sparkles;
  }
}

export default function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  const { t } = useTranslation();

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
        {t("chat.suggestionChips.title")}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => {
          const Icon = iconForSuggestion(suggestion.type);
          return (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onSelect(suggestion)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-secondary/75 px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent-blue/30 hover:bg-white/5 hover:text-text-primary cursor-pointer"
              title={suggestion.description}
            >
              <Icon size={13} className="text-accent-blue" />
              <span>{suggestion.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
