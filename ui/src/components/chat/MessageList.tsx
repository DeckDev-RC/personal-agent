import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, ChevronDown } from "lucide-react";
import type { AttachmentPayload } from "../../../../src/types/runtime.js";
import MessageBubble from "./MessageBubble";

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
  const messageDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  if (sameDay(messageDate, today)) {
    return t("chat.today");
  }

  if (sameDay(messageDate, yesterday)) {
    return t("chat.yesterday");
  }

  return messageDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="h-px flex-1 bg-border" />
      <span className="whitespace-nowrap text-[11px] font-medium text-text-secondary/50">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function StreamingDots({ label }: { label?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Bot size={13} />
      </div>
      <div className="flex items-center gap-2.5 py-2">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-1.5 w-1.5 rounded-full bg-accent"
              style={{
                animation: "pulse-dot 1.4s ease-in-out infinite",
                animationDelay: `${index * 160}ms`,
              }}
            />
          ))}
        </div>
        {label && <span className="text-[11px] text-text-secondary/60">{label}</span>}
      </div>
    </div>
  );
}

const streamingMdClass =
  "prose prose-invert prose-sm max-w-none text-text-primary/90 leading-relaxed " +
  "[&_p]:my-1.5 [&_p]:leading-relaxed [&_ul]:my-2 [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:pl-4 [&_li]:my-0.5 " +
  "[&_li]:text-text-primary/85 [&_li_p]:my-0 " +
  "[&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-[#0c0c0e] [&_pre]:px-4 [&_pre]:py-3 [&_pre]:my-3 " +
  "[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-surface-inset [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 " +
  "[&_:not(pre)>code]:text-accent [&_:not(pre)>code]:text-[0.88em] " +
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-3 " +
  "[&_strong]:text-text-primary [&_strong]:font-semibold ";

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
  const animatedIdsRef = useRef<Set<string>>(new Set());
  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setShowScrollButton(distanceFromBottom > 200);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!showScrollButton) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, showScrollButton, streamingText]);

  const groupedMessages = useMemo(() => {
    const groups: { label: string; messages: Message[] }[] = [];
    let currentLabel = "";

    for (const message of messages) {
      const label = getDateLabel(message.timestamp, t);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, messages: [message] });
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    }

    return groups;
  }, [messages, t]);

  const newMessageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      if (!animatedIdsRef.current.has(message.id)) {
        ids.add(message.id);
      }
    }
    return ids;
  }, [messages]);

  useEffect(() => {
    for (const message of messages) {
      animatedIdsRef.current.add(message.id);
    }
  }, [messages]);

  let staggerIndex = 0;

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto px-6 py-5"
    >
      <div className="w-full">
        {groupedMessages.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex > 0 ? "mt-2" : ""}>
            <DateSeparator label={group.label} />
            {group.messages.map((message, messageIndex) => {
              const previousMessage = messageIndex > 0 ? group.messages[messageIndex - 1] : undefined;
              const isConsecutiveTool =
                message.role === "tool" && previousMessage?.role === "tool";
              const isNew = newMessageIds.has(message.id);
              const animationDelay = isNew ? staggerIndex++ * 50 : 0;
              const marginTopClass = messageIndex === 0 ? "" : isConsecutiveTool ? "mt-1.5" : "mt-5";

              return (
                <div key={message.id} className={marginTopClass}>
                  <MessageBubble
                    role={message.role}
                    content={message.content}
                    thinkingContent={message.thinkingContent}
                    model={message.model}
                    timestamp={message.timestamp}
                    toolName={message.toolName}
                    phase={message.phase}
                    attachments={message.attachments}
                    onSpeak={
                      message.role === "assistant" && onSpeakMessage
                        ? (content) => onSpeakMessage(message.id, content)
                        : undefined
                    }
                    speaking={speakingMessageId === message.id}
                    animated={isNew}
                    animationDelay={animationDelay}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {streaming && (
          <div className="mt-5">
            {streamingText ? (
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Bot size={13} />
                </div>
                <div className="min-w-0 max-w-[680px]">
                  <div className={streamingMdClass}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamingText}
                    </ReactMarkdown>
                    <span
                      className="ml-0.5 inline-block align-baseline text-accent"
                      style={{ animation: "cursor-blink 1s step-end infinite" }}
                    >
                      |
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <StreamingDots label={thinkingText ? t("chat.thinking") : undefined} />
            )}
          </div>
        )}

        <div ref={bottomRef} className="h-2" />
      </div>

      <button
        type="button"
        onClick={scrollToBottom}
        className={`sticky bottom-4 left-full mr-4 flex items-center gap-1.5 rounded-full border border-border bg-surface-raised/80 px-3 py-1.5 text-[11px] text-text-secondary shadow-lg backdrop-blur-md transition-all duration-200 hover:text-text-primary ${
          showScrollButton ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-label={t("chat.scrollToBottom")}
      >
        <ChevronDown size={14} />
        <span>{t("chat.scrollToBottom")}</span>
      </button>
    </div>
  );
}
