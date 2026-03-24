import React, { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Wrench, ChevronDown, ChevronRight, Sparkles, Copy, RotateCcw, Pencil, Volume2, Loader2, X } from "lucide-react";
import type { AttachmentPayload } from "../../../../src/types/runtime.js";
import Badge from "../shared/Badge";

type MessageBubbleProps = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  thinkingContent?: string;
  model?: string;
  timestamp?: number;
  toolName?: string;
  phase?: string;
  attachments?: AttachmentPayload[];
  onRetry?: () => void;
  onEdit?: (content: string) => void;
  onSpeak?: (content: string) => void;
  speaking?: boolean;
};

export default function MessageBubble({
  role,
  content,
  thinkingContent,
  model,
  toolName,
  phase,
  attachments,
  onRetry,
  onEdit,
  onSpeak,
  speaking = false,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [showThinking, setShowThinking] = useState(false);
  const [showToolBody, setShowToolBody] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const imageAttachments = useMemo(
    () => (attachments ?? []).filter((a) => a.mimeType.startsWith("image/")),
    [attachments],
  );
  const audioAttachments = useMemo(
    () => (attachments ?? []).filter((a) => a.mimeType.startsWith("audio/")),
    [attachments],
  );
  const otherAttachments = useMemo(
    () => (attachments ?? []).filter((a) => !a.mimeType.startsWith("image/") && !a.mimeType.startsWith("audio/")),
    [attachments],
  );
  const isUser = role === "user";
  const isTool = role === "tool";
  const isSystem = role === "system";
  const isAssistant = role === "assistant";
  const isLongToolOutput = isTool && content.split("\n").length > 10;
  const timestampLabel =
    typeof timestamp === "number"
      ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : undefined;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  const avatarClasses = isSystem
    ? "bg-white/10 text-text-secondary"
    : isTool
      ? "bg-accent-orange/15 text-accent-orange"
      : "bg-accent-green/15 text-accent-green";

  const bubbleClasses = isSystem
    ? "border border-white/8 bg-white/[0.03]"
    : isTool
      ? "border border-accent-orange/18 bg-[linear-gradient(180deg,rgba(251,146,60,0.05),rgba(251,146,60,0.02))]"
      : isAssistant
        ? "border border-accent-green/12 bg-[linear-gradient(180deg,rgba(74,222,128,0.05),rgba(74,222,128,0.02))]"
        : "border border-accent-blue/12 bg-[linear-gradient(180deg,rgba(96,165,250,0.05),rgba(96,165,250,0.02))]";

  const phaseBadge =
    phase && !isTool
      ? t(`chat.console.phases.${phase}`, phase)
      : phase;

  const rowClasses = isUser ? "w-full justify-end" : "w-full justify-start";
  const contentWidthClass = isSystem
    ? "max-w-[760px]"
    : isUser
      ? "max-w-[520px]"
      : isTool
        ? "max-w-[760px]"
        : "max-w-[720px]";

  const showActions = !isSystem;

  return (
    <div className={`flex gap-2 py-1.5 ${rowClasses}`}>
      {!isUser && (
        <div
          className={`shrink-0 w-5.5 h-5.5 rounded-lg flex items-center justify-center mt-0.5 ${
            avatarClasses
          }`}
        >
          {isSystem ? <Sparkles size={12} /> : isTool ? <Wrench size={12} /> : <Bot size={12} />}
        </div>
      )}

      {/* Content */}
      <div className={`group relative ${contentWidthClass} min-w-0 rounded-xl px-3 py-2 ${bubbleClasses} ${isUser ? "ml-auto" : ""}`}>
        {/* Hover action bar */}
        {showActions && (
          <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute -top-3 right-2 z-10 flex flex-row items-center gap-0.5 rounded-md bg-bg-primary/90 backdrop-blur border border-border px-0.5 py-0.5 shadow-sm">
            {/* Copy button */}
            <div className="relative">
              <button
                onClick={handleCopy}
                aria-label="Copy"
                className="h-6 w-6 flex items-center justify-center rounded text-text-secondary/70 hover:text-text-primary hover:bg-white/10 cursor-pointer transition-colors"
              >
                <Copy size={12} />
              </button>
              {copied && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-bg-primary border border-border px-1.5 py-0.5 text-[10px] text-text-primary shadow-md">
                  Copied!
                </div>
              )}
            </div>

            {/* Retry button (assistant only) */}
            {isAssistant && onRetry && (
              <button
                onClick={onRetry}
                aria-label="Retry"
                className="h-6 w-6 flex items-center justify-center rounded text-text-secondary/70 hover:text-text-primary hover:bg-white/10 cursor-pointer transition-colors"
              >
                <RotateCcw size={12} />
              </button>
            )}

            {isAssistant && onSpeak && (
              <button
                onClick={() => onSpeak(content)}
                aria-label="Speak"
                className="h-6 w-6 flex items-center justify-center rounded text-text-secondary/70 hover:text-text-primary hover:bg-white/10 cursor-pointer transition-colors disabled:cursor-default disabled:opacity-50"
                disabled={speaking}
              >
                {speaking ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
              </button>
            )}

            {/* Edit button (user only) */}
            {isUser && onEdit && (
              <button
                onClick={() => onEdit(content)}
                aria-label="Edit"
                className="h-6 w-6 flex items-center justify-center rounded text-text-secondary/70 hover:text-text-primary hover:bg-white/10 cursor-pointer transition-colors"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        )}

        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <div className="text-[9px] uppercase tracking-[0.12em] text-text-secondary/50">
            {isSystem ? t("chat.roles.system") : isUser ? t("chat.roles.user") : isTool ? toolName ?? t("chat.roles.tool") : t("chat.roles.assistant")}
          </div>
          {phaseBadge && !isTool && !isUser && <Badge color="gray" className="px-1.5 py-0 text-[10px]">{phaseBadge}</Badge>}
          {model && !isUser && !isTool && <Badge color="gray" className="px-1.5 py-0 text-[10px]">{model}</Badge>}
          {timestampLabel && <div className={`${isUser ? "" : "ml-auto"} text-[9px] text-text-secondary/38`}>{timestampLabel}</div>}
        </div>

        {/* Thinking collapsible */}
        {thinkingContent && (
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="flex items-center gap-1 text-[11px] text-text-secondary/70 hover:text-text-secondary mb-1 cursor-pointer"
          >
            {showThinking ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{t("chat.thinking")}</span>
          </button>
        )}
        {showThinking && thinkingContent && (
          <div className="mb-1 pl-2.5 border-l-2 border-border text-[11px] text-text-secondary/70 whitespace-pre-wrap leading-5">
            {thinkingContent}
          </div>
        )}

        {/* Message text */}
        <div className="prose prose-invert prose-sm max-w-none text-text-primary leading-[1.5] [&_pre]:bg-bg-tertiary [&_pre]:border [&_pre]:border-border [&_pre]:rounded-lg [&_code]:text-accent-orange [&_code]:text-xs [&_a]:text-accent-blue [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0">
          {isUser || isSystem ? (
            <p className={`whitespace-pre-wrap ${isSystem ? "text-[13px] text-text-secondary/82" : "text-[14px]"}`}>{content}</p>
          ) : isTool ? (
            <div>
              {isLongToolOutput && (
                <button
                  onClick={() => setShowToolBody((value) => !value)}
                  className="mb-1 inline-flex items-center gap-1 rounded-md border border-border bg-bg-primary px-2 py-0.5 text-[10px] text-text-secondary hover:text-text-primary hover:bg-white/5 cursor-pointer"
                >
                  {showToolBody ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {showToolBody ? t("chat.hideOutput") : t("chat.expandOutput")}
                </button>
              )}
              {(!isLongToolOutput || showToolBody) && (
                <pre className="whitespace-pre-wrap font-mono text-[11px] bg-bg-tertiary border border-border rounded-lg p-3 overflow-x-auto leading-5">
                  {content}
                </pre>
              )}
              {isLongToolOutput && !showToolBody && (
                <pre className="whitespace-pre-wrap font-mono text-[11px] bg-bg-tertiary border border-border rounded-lg p-3 overflow-x-auto leading-5">
                  {content.split("\n").slice(0, 8).join("\n")}
                  {"\n..."}
                </pre>
              )}
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ src, alt, ...props }) => (
                  <img
                    src={src}
                    alt={alt ?? ""}
                    loading="lazy"
                    className="max-w-full max-h-80 rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => src && setPreviewImage(src)}
                    {...props}
                  />
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>

        {/* Inline media previews for attachments */}
        {imageAttachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {imageAttachments.map((att, idx) => {
              const src = `data:${att.mimeType};base64,${att.bytesBase64}`;
              return (
                <img
                  key={`img-${idx}`}
                  src={src}
                  alt={att.fileName}
                  loading="lazy"
                  className="max-w-[240px] max-h-40 rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity object-cover"
                  onClick={() => setPreviewImage(src)}
                />
              );
            })}
          </div>
        )}
        {audioAttachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {audioAttachments.map((att, idx) => (
              <audio
                key={`audio-${idx}`}
                controls
                className="max-w-full h-8"
                src={`data:${att.mimeType};base64,${att.bytesBase64}`}
              />
            ))}
          </div>
        )}
        {otherAttachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {otherAttachments.map((att, idx) => (
              <div key={`file-${idx}`} className="flex items-center gap-1.5 rounded-md border border-border bg-bg-tertiary px-2 py-1 text-[10px] text-text-secondary">
                <span className="truncate max-w-[160px]">{att.fileName}</span>
                <span className="text-text-secondary/50">({Math.round(att.byteSize / 1024)}KB)</span>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Image preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors cursor-pointer"
            aria-label={t("common.close")}
          >
            <X size={24} />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
