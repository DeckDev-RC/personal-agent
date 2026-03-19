import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";

type ChatSearchProps = {
  messages: { id: string; role: string; content: string }[];
  onClose: () => void;
  onNavigateToMessage: (messageId: string) => void;
};

export default function ChatSearch({
  messages,
  onClose,
  onNavigateToMessage,
}: ChatSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return messages.filter((m) => m.content.toLowerCase().includes(lower));
  }, [query, messages]);

  useEffect(() => {
    setActiveIndex(0);
  }, [matches.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (matches.length > 0) {
      onNavigateToMessage(matches[activeIndex]?.id);
    }
  }, [activeIndex, matches, onNavigateToMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (matches.length === 0) return;
        if (e.shiftKey) {
          setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
        } else {
          setActiveIndex((prev) => (prev + 1) % matches.length);
        }
      }
    },
    [matches.length, onClose],
  );

  const goUp = useCallback(() => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const goDown = useCallback(() => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-2 border-b bg-bg-secondary border-border px-4 py-2 shadow-md">
      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("chatSearch.placeholder", "Search messages...")}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
      />
      {query.trim() && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {matches.length > 0
            ? t("chatSearch.matchCount", "{{current}} of {{total}} results", {
                current: activeIndex + 1,
                total: matches.length,
              })
            : t("chatSearch.noResults", "No results")}
        </span>
      )}
      <button
        type="button"
        onClick={goUp}
        disabled={matches.length === 0}
        className="p-1 rounded hover:bg-bg-tertiary disabled:opacity-40"
        aria-label={t("chatSearch.previousResult", "Previous result")}
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={goDown}
        disabled={matches.length === 0}
        className="p-1 rounded hover:bg-bg-tertiary disabled:opacity-40"
        aria-label={t("chatSearch.nextResult", "Next result")}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="p-1 rounded hover:bg-bg-tertiary"
        aria-label={t("chatSearch.close", "Close search")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
