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

function iconForSuggestion(type: ProactiveSuggestion["type"]) {
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
    <div className="flex flex-col gap-2.5">
      <div className="text-[11px] font-medium tracking-tight text-[var(--muted)]">
        {t("chat.suggestionChips.title")}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => {
          const Icon = iconForSuggestion(suggestion.type);
          return (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onSelect(suggestion)}
              className="group inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-transparent px-3 py-2 text-left text-[12px] font-medium text-text-secondary transition-all duration-150 hover:scale-[1.02] hover:border-accent/20 hover:bg-accent-muted hover:text-text-primary"
              title={suggestion.description}
              style={{
                animation: "slide-in-left 0.25s var(--ease-out) both",
                animationDelay: `${index * 60}ms`,
              }}
            >
              <Icon size={13} className="text-[var(--muted)] transition-colors group-hover:text-accent" />
              <span>{suggestion.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
