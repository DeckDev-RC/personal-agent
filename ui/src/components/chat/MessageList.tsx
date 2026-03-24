import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MessageBubble from "./MessageBubble";
import { ArrowDown, Loader2 } from "lucide-react";
import type { AttachmentPayload } from "../../../../src/types/runtime.js";

type Message = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  thinkingContent?: string;
  model?: string;
  timestamp: number;
  toolName?: string;
  phase?: string;
  attachments?: AttachmentPayload[];
};

type MessageListProps = {
  messages: Message[];
  streaming: boolean;
  streamingText: string;
  thinkingText: string;
  onSpeakMessage?: (messageId: string, content: string) => void;
  speakingMessageId?: string | null;
};

function getDateLabel(timestamp: number, t: (key: string) => string): string {
  const msgDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(msgDate, today)) return t("chat.today");
  if (sameDay(msgDate, yesterday)) return t("chat.yesterday");

  return msgDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-text-secondary/60 uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function MessageList({
  messages,
  streaming,
  streamingText,
  thinkingText,
  onSpeakMessage,
  speakingMessageId,
}: MessageListProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 200);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!showScrollButton) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, streamingText, showScrollButton]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { label: string; messages: Message[] }[] = [];
    let currentLabel = "";

    for (const msg of messages) {
      const label = getDateLabel(msg.timestamp, t);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }

    return groups;
  }, [messages, t]);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto px-5 py-3"
    >
      <div className="w-full">
        <div className="space-y-0.5">
          {groupedMessages.map((group, groupIndex) => (
            <React.Fragment key={groupIndex}>
              <DateSeparator label={group.label} />
              {group.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  thinkingContent={msg.thinkingContent}
                  model={msg.model}
                  timestamp={msg.timestamp}
                  toolName={msg.toolName}
                  phase={msg.phase}
                  attachments={msg.attachments}
                  onSpeak={msg.role === "assistant" && onSpeakMessage ? (content) => onSpeakMessage(msg.id, content) : undefined}
                  speaking={speakingMessageId === msg.id}
                />
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Streaming message */}
        {streaming && (
          <div className="mt-1.5 rounded-xl border border-accent-green/15 bg-accent-green/[0.03] px-3 py-2">
            {thinkingText && !streamingText && (
              <div className="flex items-center gap-2 py-2 text-xs text-text-secondary/60">
                <Loader2 size={12} className="animate-spin" />
                <span>{t("chat.thinking")}</span>
              </div>
            )}
            {streamingText && (
              <MessageBubble
                role="assistant"
                content={streamingText}
                thinkingContent={thinkingText || undefined}
                phase={t("chat.streamingPhase")}
              />
            )}
            {!streamingText && !thinkingText && (
              <div className="flex items-center gap-2 py-3">
                <Loader2 size={14} className="animate-spin text-accent-green" />
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} className="h-2" />
      </div>

      {/* Scroll-to-bottom button */}
      <button
        onClick={scrollToBottom}
        className={`sticky bottom-4 left-full mr-4 rounded-full bg-bg-secondary border border-border shadow-lg p-2 transition-opacity duration-200 ${
          showScrollButton
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        aria-label="Scroll to bottom"
      >
        <ArrowDown size={16} />
      </button>
    </div>
  );
}
