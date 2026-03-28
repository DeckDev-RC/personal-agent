import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  Pencil,
  RotateCcw,
  Volume2,
  X,
  User,
  Terminal,
  Wrench,
  Brain,
} from "lucide-react";
import type { AttachmentPayload } from "../../../../src/types/runtime.js";

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

/* ------------------------------------------------------------------ */
/*  Markdown styling                                                   */
/* ------------------------------------------------------------------ */

const mdClass =
  "prose prose-invert prose-sm max-w-none text-text-primary/90 leading-relaxed " +
  // Paragraphs – tight
  "[&_p]:my-1.5 [&_p]:leading-relaxed " +
  // Lists – compact
  "[&_ul]:my-2 [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:pl-4 [&_li]:my-0.5 " +
  "[&_li]:text-text-primary/85 [&_li_p]:my-0 " +
  // Headings – clear hierarchy
  "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-text-primary [&_h1]:border-b [&_h1]:border-border [&_h1]:pb-1.5 " +
  "[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3.5 [&_h2]:mb-1.5 [&_h2]:text-text-primary " +
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-text-primary/90 " +
  // Code blocks – polished
  "[&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-[#0c0c0e] [&_pre]:px-4 [&_pre]:py-3 [&_pre]:my-3 [&_pre]:text-[12.5px] [&_pre]:leading-[1.7] " +
  "[&_pre]:overflow-x-auto [&_pre]:relative " +
  // Inline code – subtle pill
  "[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-surface-inset [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 " +
  "[&_:not(pre)>code]:text-accent [&_:not(pre)>code]:text-[0.88em] [&_:not(pre)>code]:font-normal " +
  // Links
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-accent/40 hover:[&_a]:decoration-accent " +
  // Blockquotes – accent border
  "[&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-3 [&_blockquote]:my-2 " +
  "[&_blockquote]:text-text-secondary [&_blockquote]:italic [&_blockquote_p]:my-0.5 " +
  // Tables – clean
  "[&_table]:my-3 [&_table]:text-xs [&_table]:w-full " +
  "[&_th]:text-left [&_th]:font-semibold [&_th]:text-text-secondary [&_th]:pb-2 [&_th]:border-b [&_th]:border-border " +
  "[&_td]:py-1.5 [&_td]:pr-3 [&_td]:border-b [&_td]:border-border/40 " +
  // HR
  "[&_hr]:my-4 [&_hr]:border-border/40 " +
  // Strong / em
  "[&_strong]:text-text-primary [&_strong]:font-semibold ";

/* ------------------------------------------------------------------ */
/*  Avatar                                                              */
/* ------------------------------------------------------------------ */

function RoleAvatar({ role }: { role: string }) {
  if (role === "user") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--indicator-user)]/15 text-[var(--indicator-user)]">
        <User size={13} />
      </div>
    );
  }
  if (role === "assistant") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Bot size={13} />
      </div>
    );
  }
  if (role === "tool") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--indicator-tool)]/10 text-[var(--indicator-tool)]">
        <Wrench size={10} />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-border/30 text-text-secondary">
      <Terminal size={13} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Code block with copy                                               */
/* ------------------------------------------------------------------ */

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");
  const lang = className?.replace("language-", "") ?? "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <div className="group/code relative">
      {lang && (
        <div className="absolute top-0 left-3 -translate-y-1/2 rounded-md bg-border/60 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-text-secondary">
          {lang}
        </div>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-white/5 text-text-secondary/50 opacity-0 transition-all hover:bg-white/10 hover:text-text-primary group-hover/code:opacity-100 cursor-pointer"
        aria-label="Copy code"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
      <code className={className}>{children}</code>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

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
  const [showMeta, setShowMeta] = useState(false);

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
  const isLongToolOutput = isTool && content.split("\n").length > 6;

  const timestampLabel =
    typeof timestamp === "number"
      ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : undefined;

  const animationStyle = animated
    ? { animation: `message-enter 0.35s var(--ease-out) ${animationDelay}ms both` }
    : undefined;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  /* --- Preview modal --- */
  const previewModal = previewImage ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={() => setPreviewImage(null)}
    >
      <button
        type="button"
        onClick={() => setPreviewImage(null)}
        className="absolute right-4 top-4 cursor-pointer text-white/70 transition-colors hover:text-white"
      >
        <X size={24} />
      </button>
      <img
        src={previewImage}
        alt="Preview"
        className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  ) : null;

  /* --- Attachments --- */
  const attachmentBlock = (
    <>
      {imageAttachments.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {imageAttachments.map((a, i) => {
            const src = `data:${a.mimeType};base64,${a.bytesBase64}`;
            return (
              <img
                key={i}
                src={src}
                alt={a.fileName}
                loading="lazy"
                className="max-h-36 max-w-[200px] cursor-pointer rounded-lg border border-border/40 object-cover transition hover:brightness-110"
                onClick={() => setPreviewImage(src)}
              />
            );
          })}
        </div>
      )}
      {audioAttachments.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {audioAttachments.map((a, i) => (
            <audio key={i} controls className="h-8 max-w-full" src={`data:${a.mimeType};base64,${a.bytesBase64}`} />
          ))}
        </div>
      )}
      {otherAttachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {otherAttachments.map((a, i) => (
            <span key={i} className="rounded-md bg-surface-inset px-2 py-1 text-[10px] text-text-secondary">
              {a.fileName} <span className="opacity-50">({Math.round(a.byteSize / 1024)}KB)</span>
            </span>
          ))}
        </div>
      )}
    </>
  );

  /* --- Inline action bar (hover) --- */
  const actionBar = (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
      <button type="button" onClick={handleCopy} className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary/50 hover:bg-white/5 hover:text-text-primary cursor-pointer">
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
      {isAssistant && onRetry && (
        <button type="button" onClick={onRetry} className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary/50 hover:bg-white/5 hover:text-text-primary cursor-pointer">
          <RotateCcw size={11} />
        </button>
      )}
      {isAssistant && onSpeak && (
        <button type="button" onClick={() => onSpeak(content)} disabled={speaking} className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary/50 hover:bg-white/5 hover:text-text-primary disabled:opacity-30 cursor-pointer">
          {speaking ? <Loader2 size={11} className="animate-spin" /> : <Volume2 size={11} />}
        </button>
      )}
      {isUser && onEdit && (
        <button type="button" onClick={() => onEdit(content)} className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary/50 hover:bg-white/5 hover:text-text-primary cursor-pointer">
          <Pencil size={11} />
        </button>
      )}
      {timestampLabel && (
        <span className="pl-1 text-[9px] text-text-secondary/30 tabular-nums">{timestampLabel}</span>
      )}
    </div>
  );

  /* --- Thinking --- */
  const thinkingBlock = thinkingContent ? (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setShowThinking((v) => !v)}
        className="mb-1 inline-flex cursor-pointer items-center gap-1 rounded-md bg-surface-inset/50 px-2 py-0.5 text-[10px] text-text-secondary/60 transition hover:text-text-secondary"
      >
        <Brain size={10} />
        {showThinking ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span>{t("chat.thinking")}</span>
      </button>
      {showThinking && (
        <div className="rounded-lg bg-surface-inset/30 px-3 py-2 text-[11px] leading-5 whitespace-pre-wrap text-text-secondary/60">
          {thinkingContent}
        </div>
      )}
    </div>
  ) : null;

  /* =================================================================
     USER MESSAGE
     ================================================================= */
  if (isUser) {
    return (
      <>
        <div className="group flex items-start gap-3 justify-end" style={animationStyle}>
          <div className="flex flex-col items-end gap-1 min-w-0 max-w-[560px]">
            <div className="rounded-2xl rounded-br-md bg-surface-raised px-4 py-2.5">
              <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-text-primary">{content}</p>
              {attachmentBlock}
            </div>
            {actionBar}
          </div>
          <RoleAvatar role="user" />
        </div>
        {previewModal}
      </>
    );
  }

  /* =================================================================
     ASSISTANT MESSAGE
     ================================================================= */
  if (isAssistant) {
    return (
      <>
        <div className="group flex items-start gap-3" style={animationStyle}>
          <RoleAvatar role="assistant" />
          <div className="flex flex-col gap-1 min-w-0 max-w-[680px]">
            <div>
              {thinkingBlock}
              <div className={mdClass}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ children, className, ...props }) {
                      const isInline = !className;
                      if (isInline) {
                        return <code className={className} {...props}>{children}</code>;
                      }
                      return <CodeBlock className={className}>{children}</CodeBlock>;
                    },
                    img({ src, alt, ...props }) {
                      return (
                        <img
                          src={src}
                          alt={alt ?? ""}
                          loading="lazy"
                          className="max-h-72 max-w-full cursor-pointer rounded-lg border border-border/40 transition hover:brightness-110"
                          onClick={() => src && setPreviewImage(src)}
                          {...props}
                        />
                      );
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
              {attachmentBlock}
            </div>
            {actionBar}
          </div>
        </div>
        {previewModal}
      </>
    );
  }

  /* =================================================================
     TOOL MESSAGE – compact, collapsed by default
     ================================================================= */
  if (isTool) {
    const toolLines = content.split("\n");
    const preview = toolLines.slice(0, 4).join("\n");
    const hasMore = toolLines.length > 4;

    return (
      <div className="flex items-start gap-2 ml-10" style={animationStyle}>
        <RoleAvatar role="tool" />
        <div className="group min-w-0 max-w-[640px]">
          {/* Tool header – always visible */}
          <button
            type="button"
            onClick={() => setShowToolBody((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] text-text-secondary/60 hover:bg-surface-inset/50 hover:text-text-secondary transition cursor-pointer"
          >
            {showToolBody ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span className="font-mono font-medium text-[var(--indicator-tool)]">{toolName ?? "tool"}</span>
            {!showToolBody && hasMore && (
              <span className="text-text-secondary/30">({toolLines.length} linhas)</span>
            )}
          </button>

          {/* Tool output */}
          {showToolBody && (
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#0c0c0e] px-3 py-2.5 font-mono text-[11px] leading-5 text-text-primary/70 border border-border/30">
              {content}
            </pre>
          )}

          {/* Collapsed preview – just first lines */}
          {!showToolBody && content.trim() && (
            <pre className="mt-0.5 overflow-hidden whitespace-pre-wrap rounded-lg px-2 py-1 font-mono text-[10px] leading-4 text-text-secondary/35 max-h-[52px]">
              {preview}{hasMore ? "\n..." : ""}
            </pre>
          )}
        </div>
      </div>
    );
  }

  /* =================================================================
     SYSTEM MESSAGE
     ================================================================= */
  return (
    <div className="flex items-start gap-3 px-4" style={animationStyle}>
      <RoleAvatar role="system" />
      <div className="min-w-0 max-w-[680px]">
        <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-text-secondary/60 italic">{content}</p>
      </div>
    </div>
  );
}
