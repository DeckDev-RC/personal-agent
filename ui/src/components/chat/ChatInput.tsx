import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Bot, Paperclip, Square, X, Plus, Trash2, Download, Search, Cpu, Mic, MicOff } from "lucide-react";
import { isSpeechSupported, startRecognition, stopRecognition } from "../../utils/speech";

export type PendingAttachment = {
  fileName: string;
  mimeType: string;
  bytesBase64: string;
  byteSize: number;
};

export type ChatAgentSuggestion = {
  agentId: string;
  agentName: string;
  confidence: "low" | "medium" | "high";
  category: "pm" | "communication" | "research" | "technical" | "generic";
  matchedKeywords: string[];
};

type SlashCommand = {
  name: string;
  icon: React.ReactNode;
  labelKey: string;
  descriptionKey: string;
};

type ChatInputProps = {
  onSend: (payload: { message: string; attachments: PendingAttachment[] }) => void;
  onAbort: () => void;
  disabled: boolean;
  streaming: boolean;
  onSlashCommand?: (command: string) => void;
  draftValue?: string;
  onDraftChange?: (value: string) => void;
  agentSuggestion?: ChatAgentSuggestion | null;
  onApplyAgentSuggestion?: (agentId: string) => void;
  onDismissAgentSuggestion?: () => void;
};

const MAX_HISTORY = 50;

export default function ChatInput({
  onSend,
  onAbort,
  disabled,
  streaming,
  onSlashCommand,
  draftValue,
  onDraftChange,
  agentSuggestion,
  onApplyAgentSuggestion,
  onDismissAgentSuggestion,
}: ChatInputProps) {
  const { t, i18n } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const isControlled = typeof draftValue === "string";
  const value = isControlled ? draftValue : localValue;

  const setValue = useCallback(
    (nextValue: React.SetStateAction<string>) => {
      const resolvedValue =
        typeof nextValue === "function"
          ? nextValue(value)
          : nextValue;

      if (isControlled) {
        onDraftChange?.(resolvedValue);
        return;
      }

      setLocalValue(resolvedValue);
    },
    [isControlled, onDraftChange, value],
  );

  // --- Input History ---
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef("");

  // --- Voice Input ---
  const [listening, setListening] = useState(false);
  const speechSupported = useMemo(() => isSpeechSupported(), []);

  const toggleVoice = useCallback(() => {
    if (listening) {
      stopRecognition();
      setListening(false);
    } else {
      const started = startRecognition(
        (transcript, isFinal) => {
          if (isFinal) {
            setValue((prev) => prev + transcript + " ");
          }
        },
        () => setListening(false),
        i18n.language === "pt-BR" ? "pt-BR" : i18n.language === "es" ? "es-ES" : i18n.language === "de" ? "de-DE" : i18n.language === "zh-CN" ? "zh-CN" : i18n.language === "zh-TW" ? "zh-TW" : "en-US",
      );
      if (started) setListening(true);
    }
  }, [i18n.language, listening, setValue]);

  // --- Slash Commands ---
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashCommandIndex, setSlashCommandIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  const slashCommands: SlashCommand[] = useMemo(
    () => [
      { name: "new", icon: <Plus size={14} />, labelKey: "slashCommand.new", descriptionKey: "slashCommand.newDesc" },
      { name: "clear", icon: <Trash2 size={14} />, labelKey: "slashCommand.clear", descriptionKey: "slashCommand.clearDesc" },
      { name: "export", icon: <Download size={14} />, labelKey: "slashCommand.export", descriptionKey: "slashCommand.exportDesc" },
      { name: "search", icon: <Search size={14} />, labelKey: "slashCommand.search", descriptionKey: "slashCommand.searchDesc" },
      { name: "model", icon: <Cpu size={14} />, labelKey: "slashCommand.model", descriptionKey: "slashCommand.modelDesc" },
    ],
    [],
  );

  const filteredCommands = useMemo(() => {
    if (!showSlashMenu) return [];
    const query = value.slice(1).toLowerCase();
    if (!query) return slashCommands;
    return slashCommands.filter((cmd) => cmd.name.startsWith(query));
  }, [showSlashMenu, value, slashCommands]);

  // Detect slash command trigger
  useEffect(() => {
    if (value.startsWith("/") && value.indexOf(" ") === -1) {
      setShowSlashMenu(true);
      setSlashCommandIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [value]);

  // Scroll the selected slash command item into view
  useEffect(() => {
    if (!showSlashMenu || !slashMenuRef.current) return;
    const items = slashMenuRef.current.querySelectorAll("[data-slash-item]");
    items[slashCommandIndex]?.scrollIntoView({ block: "nearest" });
  }, [slashCommandIndex, showSlashMenu]);

  useEffect(() => {
    if (!disabled && !streaming) {
      textareaRef.current?.focus();
    }
  }, [disabled, streaming]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  const executeSlashCommand = useCallback(
    (command: string) => {
      setValue("");
      setShowSlashMenu(false);
      onSlashCommand?.(command);
    },
    [onSlashCommand, setValue],
  );

  function handleSubmit() {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;

    if (trimmed) {
      setInputHistory((prev) => {
        const next = [trimmed, ...prev.filter((h) => h !== trimmed)];
        return next.slice(0, MAX_HISTORY);
      });
    }
    setHistoryIndex(-1);
    draftRef.current = "";

    onSend({ message: trimmed, attachments });
    setValue("");
    setAttachments([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // --- Slash command menu navigation ---
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashCommandIndex((prev) => (prev <= 0 ? filteredCommands.length - 1 : prev - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashCommandIndex((prev) => (prev >= filteredCommands.length - 1 ? 0 : prev + 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        executeSlashCommand(filteredCommands[slashCommandIndex].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        executeSlashCommand(filteredCommands[slashCommandIndex].name);
        return;
      }
    }

    if (showSlashMenu && e.key === "Escape") {
      e.preventDefault();
      setShowSlashMenu(false);
      return;
    }

    // --- Input history navigation ---
    const textarea = textareaRef.current;
    if (e.key === "ArrowUp" && !showSlashMenu) {
      const cursorAtStart = textarea ? textarea.selectionStart === 0 && textarea.selectionEnd === 0 : true;
      const isEmpty = value === "";
      if ((cursorAtStart || isEmpty) && inputHistory.length > 0) {
        e.preventDefault();
        if (historyIndex === -1) {
          draftRef.current = value;
        }
        const nextIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
        setHistoryIndex(nextIndex);
        setValue(inputHistory[nextIndex]);
        return;
      }
    }

    if (e.key === "ArrowDown" && !showSlashMenu) {
      if (historyIndex >= 0) {
        e.preventDefault();
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        if (nextIndex === -1) {
          setValue(draftRef.current);
        } else {
          setValue(inputHistory[nextIndex]);
        }
        return;
      }
    }

    // --- Normal submit ---
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  async function readFilesAsAttachments(files: File[]): Promise<PendingAttachment[]> {
    return await Promise.all(
      files.map(
        async (file) =>
          await new Promise<PendingAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              if (!(result instanceof ArrayBuffer)) {
                reject(new Error("Failed to read attachment."));
                return;
              }
              const bytes = new Uint8Array(result);
              let binary = "";
              for (let index = 0; index < bytes.length; index += 1) {
                binary += String.fromCharCode(bytes[index]);
              }
              resolve({
                fileName: file.name || "attachment",
                mimeType: file.type || "application/octet-stream",
                bytesBase64: btoa(binary),
                byteSize: file.size,
              });
            };
            reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment."));
            reader.readAsArrayBuffer(file);
          }),
      ),
    );
  }

  async function appendAttachments(files: File[]) {
    if (files.length === 0) return;
    const nextAttachments = await readFilesAsAttachments(files);
    setAttachments((current) => [...current, ...nextAttachments]);
  }

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    await appendAttachments(files);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    void appendAttachments(files);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    void appendAttachments(files);
  }

  const suggestionReason = useMemo(() => {
    if (!agentSuggestion) {
      return "";
    }

    const categoryLabel = t(`chat.agentSuggestion.categories.${agentSuggestion.category}`);
    const keywords = agentSuggestion.matchedKeywords.slice(0, 3).join(", ");

    if (keywords) {
      return t("chat.agentSuggestion.reasonWithKeywords", {
        category: categoryLabel,
        keywords,
      });
    }

    return t("chat.agentSuggestion.reason", {
      category: categoryLabel,
    });
  }, [agentSuggestion, t]);

  const hasContent = value.trim().length > 0 || attachments.length > 0;

  return (
    <div className="border-t border-border bg-bg-primary/90 px-5 py-3 backdrop-blur-xl">
      <div className="relative w-full">
        {agentSuggestion && !streaming && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/15 bg-accent-subtle px-3.5 py-2.5">
            <div className="flex min-w-0 items-start gap-2">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/45 text-accent">
                <Bot size={13} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-medium tracking-tight text-accent">
                  {t("chat.agentSuggestion.label")}
                </div>
                <div className="truncate text-[13px] font-medium text-text-primary">
                  {agentSuggestion.agentName}
                </div>
                <div className="text-[11px] text-text-secondary/80">
                  {suggestionReason}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDismissAgentSuggestion?.()}
                className="cursor-pointer rounded-lg px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-white/40 hover:text-text-primary"
              >
                {t("chat.agentSuggestion.dismiss")}
              </button>
              <button
                type="button"
                onClick={() => onApplyAgentSuggestion?.(agentSuggestion.agentId)}
                className="cursor-pointer rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-[#0a0a0a] transition-colors hover:bg-accent-hover"
              >
                {t("chat.agentSuggestion.use")}
              </button>
            </div>
          </div>
        )}

        {/* Slash command dropdown */}
        {showSlashMenu && filteredCommands.length > 0 && (
          <div
            ref={slashMenuRef}
            className="absolute bottom-full left-0 z-50 mb-2 max-h-64 w-72 overflow-y-auto rounded-2xl border border-border bg-bg-secondary/92 shadow-xl backdrop-blur-lg"
          >
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.name}
                type="button"
                data-slash-item
                onClick={() => executeSlashCommand(cmd.name)}
                onMouseEnter={() => setSlashCommandIndex(idx)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  idx === slashCommandIndex ? "bg-accent-subtle text-accent" : "text-text-secondary hover:bg-accent-muted hover:text-text-primary"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-current opacity-80">
                  {cmd.icon}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="font-medium text-text-primary">/{cmd.name}</span>
                  <span className="text-xs text-text-secondary truncate">
                    {t(cmd.descriptionKey, cmd.descriptionKey)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div
          className="flex items-end gap-2.5 rounded-2xl border border-transparent bg-surface-raised px-3 py-2 transition-all duration-200 focus-within:border-accent/30 focus-within:shadow-[0_0_0_1px_var(--accent-subtle),0_2px_8px_rgba(0,0,0,0.3)]"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="text/*,application/pdf,image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={(event) => void handleFileSelection(event)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-transparent text-text-secondary transition-colors hover:bg-bg-primary/55 hover:text-text-primary"
          title={t("chat.attachFile")}
          aria-label={t("chat.attachFile")}
        >
          <Paperclip size={14} />
        </button>
        {speechSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors ${
              listening
                ? "bg-[var(--danger-subtle)] text-[var(--danger)] hover:brightness-110"
                : "bg-transparent text-text-secondary hover:bg-bg-primary/55 hover:text-text-primary"
            }`}
            title={t("chat.voiceInput")}
            aria-label={t("chat.voiceInput")}
          >
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t("chat.placeholder")}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-[13px] text-text-primary placeholder-text-secondary/50 outline-none resize-none leading-relaxed py-1 min-h-[36px] max-h-[180px]"
        />
        {streaming ? (
          <button
            onClick={onAbort}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--danger-subtle)] text-[var(--danger)] transition-colors hover:brightness-125"
            title={t("chat.abort")}
          >
            <Square size={14} />
          </button>
          ) : (
          <button
            onClick={handleSubmit}
            disabled={!hasContent || disabled}
            className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-all duration-200 ${
              hasContent && !disabled
                ? "bg-accent text-[#0a0a0a] shadow-[0_0_12px_var(--accent-subtle)] hover:bg-accent-hover"
                : "opacity-30 bg-transparent border border-[var(--muted)]/20 text-[var(--muted)] disabled:cursor-default"
            }`}
            title={t("chat.send")}
          >
            <ArrowUp size={14} />
          </button>
          )}
        </div>
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <div
                key={`${attachment.fileName}-${index}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-2 py-1 text-[11px] text-text-secondary"
              >
                <span className="truncate max-w-[180px]">{attachment.fileName}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                  className="text-text-secondary/70 hover:text-text-primary cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
