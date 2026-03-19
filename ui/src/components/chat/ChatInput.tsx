import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Paperclip, Square, X, Plus, Trash2, Download, Search, Cpu, Mic, MicOff } from "lucide-react";
import { isSpeechSupported, startRecognition, stopRecognition } from "../../utils/speech";

export type PendingAttachment = {
  fileName: string;
  mimeType: string;
  bytesBase64: string;
  byteSize: number;
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
};

const MAX_HISTORY = 50;

export default function ChatInput({ onSend, onAbort, disabled, streaming, onSlashCommand }: ChatInputProps) {
  const { t, i18n } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

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
  }, [listening, i18n.language]);

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

  const executeSlashCommand = useCallback(
    (command: string) => {
      setValue("");
      setShowSlashMenu(false);
      onSlashCommand?.(command);
    },
    [onSlashCommand],
  );

  function handleSubmit() {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;

    // Add to history if non-empty text
    if (trimmed) {
      setInputHistory((prev) => {
        const next = [trimmed, ...prev.filter((h) => h !== trimmed)];
        return next.slice(0, MAX_HISTORY);
      });
    }
    // Reset history navigation
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
      // Tab also selects
      if (e.key === "Tab") {
        e.preventDefault();
        executeSlashCommand(filteredCommands[slashCommandIndex].name);
        return;
      }
    }

    // Dismiss slash menu on Escape even if no matches
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
          // Save current draft
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

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const nextAttachments = await Promise.all(
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
                fileName: file.name,
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
    setAttachments((current) => [...current, ...nextAttachments]);
  }

  return (
    <div className="border-t border-border bg-bg-primary/90 px-5 py-2.5 backdrop-blur">
      <div className="relative w-full">
        {/* Slash command dropdown */}
        {showSlashMenu && filteredCommands.length > 0 && (
          <div
            ref={slashMenuRef}
            className="absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto rounded-lg border border-border bg-bg-secondary shadow-lg z-50"
          >
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.name}
                type="button"
                data-slash-item
                onClick={() => executeSlashCommand(cmd.name)}
                onMouseEnter={() => setSlashCommandIndex(idx)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                  idx === slashCommandIndex ? "bg-white/10 text-text-primary" : "text-text-secondary hover:bg-white/10"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary">
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

        <div className="flex items-end gap-2.5 rounded-xl border border-border bg-bg-secondary/90 px-3 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-green/10 text-accent-green text-sm">
            &gt;
          </div>
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
          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary transition-colors cursor-pointer"
          title={t("chat.attachFile")}
          aria-label={t("chat.attachFile")}
        >
          <Paperclip size={14} />
        </button>
        {speechSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
              listening
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
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
          placeholder={t("chat.placeholder")}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-[13px] text-text-primary placeholder-text-secondary/50 outline-none resize-none leading-relaxed py-1 min-h-[36px] max-h-[180px]"
        />
        {streaming ? (
          <button
            onClick={onAbort}
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-accent-orange/15 text-accent-orange hover:bg-accent-orange/25 transition-colors cursor-pointer"
            title={t("chat.abort")}
          >
            <Square size={14} />
          </button>
          ) : (
          <button
            onClick={handleSubmit}
            disabled={(!value.trim() && attachments.length === 0) || disabled}
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-accent-green text-black hover:bg-[#6df29a] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:bg-accent-green/30"
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
                className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-2 py-1 text-[11px] text-text-secondary"
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
