import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  RotateCcw,
  Volume2,
  X,
} from "lucide-react";
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
  animated?: boolean;
  animationDelay?: number;
};

const assistantMarkdownClassName =
  "prose prose-invert prose-base max-w-none text-text-primary leading-[1.65] " +
  "[&_p]:my-2 [&_p]:leading-[1.65] [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 " +
  "[&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface-inset [&_pre]:px-4 [&_pre]:py-3 " +
  "[&_code]:text-accent [&_code]:text-[0.9em] [&_a]:text-accent";

export default function MessageBubble({
  role,
  content,
  thinkingContent,
  model,
  timestamp,
  toolName,
  phase,
  attachments,
  onRetry,
  onEdit,
  onSpeak,
  speaking = false,
  animated = false,
  animationDelay = 0,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [showThinking, setShowThinking] = useState(false);
  const [showToolBody, setShowToolBody] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const imageAttachments = useMemo(
    () => (attachments ?? []).filter((attachment) => attachment.mimeType.startsWith("image/")),
    [attachments],
  );
  const audioAttachments = useMemo(
    () => (attachments ?? []).filter((attachment) => attachment.mimeType.startsWith("audio/")),
    [attachments],
  );
  const otherAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (attachment) =>
          !attachment.mimeType.startsWith("image/") && !attachment.mimeType.startsWith("audio/"),
      ),
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
  const phaseLabel = phase ? t(`chat.console.phases.${phase}`, phase) : undefined;
  const roleLabel = isSystem
    ? t("chat.roles.system")
    : isUser
      ? t("chat.roles.user")
      : isTool
        ? t("chat.roles.tool")
        : t("chat.roles.assistant");

  const animationStyle = animated
    ? { animation: `message-enter 0.35s var(--ease-out) ${animationDelay}ms both` }
    : undefined;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  const previewModal = previewImage ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={() => setPreviewImage(null)}
    >
      <button
        type="button"
        onClick={() => setPreviewImage(null)}
        className="absolute right-4 top-4 cursor-pointer text-white/70 transition-colors hover:text-white"
        aria-label={t("common.close")}
      >
        <X size={24} />
      </button>
      <img
        src={previewImage}
        alt="Preview"
        className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  ) : null;

  const showActions = !isSystem;
  const actionBar = showActions ? (
    <div className="absolute -right-10 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-border/80 bg-bg-primary/88 px-1 py-1 opacity-0 shadow-sm backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      <div className="relative">
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-secondary/70 transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          <Copy size={13} />
        </button>
        {copied && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-bg-primary px-2 py-1 text-[10px] text-text-primary shadow-md">
            Copied
          </div>
        )}
      </div>

      {isAssistant && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          aria-label="Retry"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-secondary/70 transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          <RotateCcw size={13} />
        </button>
      )}

      {isAssistant && onSpeak && (
        <button
          type="button"
          onClick={() => onSpeak(content)}
          aria-label="Speak"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-secondary/70 transition-colors hover:bg-surface-raised hover:text-text-primary disabled:cursor-default disabled:opacity-50"
          disabled={speaking}
        >
          {speaking ? <Loader2 size={13} className="animate-spin" /> : <Volume2 size={13} />}
        </button>
      )}

      {isUser && onEdit && (
        <button
          type="button"
          onClick={() => onEdit(content)}
          aria-label="Edit"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-secondary/70 transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  ) : null;

  const attachmentBlock = (
    <>
      {imageAttachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2.5">
          {imageAttachments.map((attachment, index) => {
            const src = `data:${attachment.mimeType};base64,${attachment.bytesBase64}`;
            return (
              <img
                key={`img-${index}`}
                src={src}
                alt={attachment.fileName}
                loading="lazy"
                className="max-h-40 max-w-[240px] cursor-pointer rounded-xl border border-border object-cover transition-opacity hover:opacity-90"
                onClick={() => setPreviewImage(src)}
              />
            );
          })}
        </div>
      )}

      {audioAttachments.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {audioAttachments.map((attachment, index) => (
            <audio
              key={`audio-${index}`}
              controls
              className="h-8 max-w-full"
              src={`data:${attachment.mimeType};base64,${attachment.bytesBase64}`}
            />
          ))}
        </div>
      )}

      {otherAttachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {otherAttachments.map((attachment, index) => (
            <div
              key={`file-${index}`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-primary/80 px-2.5 py-1.5 text-[10px] text-text-secondary"
            >
              <span className="max-w-[160px] truncate">{attachment.fileName}</span>
              <span className="text-text-secondary/50">({Math.round(attachment.byteSize / 1024)}KB)</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const thinkingBlock = thinkingContent ? (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setShowThinking((current) => !current)}
        className="mb-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-text-secondary/75 transition-colors hover:text-text-secondary"
      >
        {showThinking ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{t("chat.thinking")}</span>
      </button>
      {showThinking && (
        <div className="border-l-2 border-border pl-3 text-[11px] leading-5 whitespace-pre-wrap text-text-secondary/72">
          {thinkingContent}
        </div>
      )}
    </div>
  ) : null;

  if (isUser) {
    return (
      <>
        <div className="flex w-full justify-end" style={animationStyle}>
          <div className="group relative min-w-0 max-w-[520px] rounded-2xl rounded-br-sm bg-surface-raised px-4 py-3">
            {actionBar}
            <div className="mb-1.5 flex items-center gap-2">
              <div className="text-[11px] font-medium tracking-tight text-[var(--indicator-user)]">
                {roleLabel}
              </div>
              {timestampLabel && (
                <div className="text-[10px] text-text-secondary/38">
                  {timestampLabel}
                </div>
              )}
            </div>
            <div className="text-[14px] leading-[1.6] whitespace-pre-wrap text-text-primary">{content}</div>
            {attachmentBlock}
          </div>
        </div>
        {previewModal}
      </>
    );
  }

  if (isAssistant) {
    return (
      <>
        <div className="flex w-full justify-start" style={animationStyle}>
          <div className="group relative min-w-0 max-w-[760px] border-l-2 border-accent pl-4">
            {actionBar}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="text-[11px] font-medium tracking-tight text-text-secondary">
                {roleLabel}
              </div>
              {phaseLabel && <Badge color="gray" className="px-1.5 py-0 text-[10px]">{phaseLabel}</Badge>}
              {model && <Badge color="gray" className="px-1.5 py-0 text-[10px]">{model}</Badge>}
              {timestampLabel && (
                <div className="text-[10px] text-text-secondary/38">
                  {timestampLabel}
                </div>
              )}
            </div>
            {thinkingBlock}
            <div className={assistantMarkdownClassName}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt, ...props }) => (
                    <img
                      src={src}
                      alt={alt ?? ""}
                      loading="lazy"
                      className="max-h-80 max-w-full cursor-pointer rounded-xl border border-border transition-opacity hover:opacity-90"
                      onClick={() => {
                        if (typeof src === "string") {
                          setPreviewImage(src);
                        }
                      }}
                      {...props}
                    />
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
            {attachmentBlock}
          </div>
        </div>
        {previewModal}
      </>
    );
  }

  if (isTool) {
    return (
      <div className="flex w-full justify-start" style={animationStyle}>
        <div className="group relative ml-6 min-w-0 max-w-[760px] rounded-2xl border-l-2 border-[var(--indicator-tool)] bg-surface-inset px-4 py-3">
          {actionBar}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-bg-primary/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--indicator-tool)]">
              fn
            </span>
            <div className="text-[11px] font-medium tracking-tight text-text-secondary">
              {toolName ?? roleLabel}
            </div>
            {phaseLabel && <Badge color="gray" className="px-1.5 py-0 text-[10px]">{phaseLabel}</Badge>}
            {timestampLabel && (
              <div className="text-[10px] text-text-secondary/38">
                {timestampLabel}
              </div>
            )}
          </div>

          {isLongToolOutput && (
            <button
              type="button"
              onClick={() => setShowToolBody((current) => !current)}
              className="mb-2 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-bg-primary/80 px-2 py-1 text-[10px] text-text-secondary transition-colors hover:bg-bg-primary hover:text-text-primary"
            >
              {showToolBody ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showToolBody ? t("chat.hideOutput") : t("chat.expandOutput")}
            </button>
          )}

          {(!isLongToolOutput || showToolBody) && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/70 bg-black/10 px-3.5 py-3 font-mono text-[11px] leading-5 text-text-primary/90">
              {content}
            </pre>
          )}

          {isLongToolOutput && !showToolBody && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/70 bg-black/10 px-3.5 py-3 font-mono text-[11px] leading-5 text-text-primary/90">
              {content.split("\n").slice(0, 8).join("\n")}
              {"\n..."}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-start" style={animationStyle}>
      <div className="group relative ml-4 min-w-0 max-w-[760px] border-l-2 border-white/15 pl-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <div className="text-[11px] font-medium tracking-tight text-text-secondary">{roleLabel}</div>
          {timestampLabel && <div className="text-[10px] text-text-secondary/38">{timestampLabel}</div>}
        </div>
        <p className="text-[13px] leading-[1.6] whitespace-pre-wrap text-text-secondary/82">{content}</p>
      </div>
    </div>
  );
}
