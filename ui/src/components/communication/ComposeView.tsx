import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Send, Save, X, Mail, MessageSquare, Hash } from "lucide-react";
import Button from "../shared/Button";
import Select from "../shared/Select";
import Input from "../shared/Input";

type DraftType = "email" | "slack" | "teams" | "generic";

type ComposeViewProps = {
  initialType?: DraftType;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  draftId?: string;
  onSave?: (draft: any) => void;
  onSend?: (draft: any) => void;
  onClose?: () => void;
};

const api = () => (window as any).codexAgent;

export default function ComposeView({
  initialType = "email",
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  draftId,
  onSave,
  onSend,
  onClose,
}: ComposeViewProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<DraftType>(initialType);
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const typeOptions = useMemo(() => [
    { value: "email", label: "Email" },
    { value: "slack", label: "Slack" },
    { value: "teams", label: "Teams" },
    { value: "generic", label: t("communication.generic", "Genérico") },
  ], [t]);

  const typeIcon = type === "email" ? Mail : type === "slack" ? Hash : MessageSquare;
  const TypeIcon = typeIcon;

  async function handleSave() {
    setSaving(true);
    try {
      const draft = draftId
        ? await api().drafts.update(draftId, { type, to, subject, body })
        : await api().drafts.create({ type, to, subject, body });
      onSave?.(draft);
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      let id = draftId;
      if (!id) {
        const draft = await api().drafts.create({ type, to, subject, body });
        id = draft.id;
      } else {
        await api().drafts.update(id, { type, to, subject, body });
      }
      const result = await api().drafts.send(id);
      onSend?.(result);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TypeIcon size={18} className="text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">
            {t("communication.compose", "Nova mensagem")}
          </h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary cursor-pointer">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
        <label className="text-xs text-text-secondary">{t("communication.type", "Tipo")}</label>
        <Select value={type} onChange={(v) => setType(v as DraftType)} options={typeOptions} />

        <label className="text-xs text-text-secondary">{t("communication.to", "Para")}</label>
        <Input value={to} onChange={setTo} placeholder={type === "email" ? "nome@email.com" : "#canal ou @usuario"} />

        {(type === "email" || type === "generic") && (
          <>
            <label className="text-xs text-text-secondary">{t("communication.subject", "Assunto")}</label>
            <Input value={subject} onChange={setSubject} placeholder={t("communication.subjectPlaceholder", "Assunto da mensagem")} />
          </>
        )}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("communication.bodyPlaceholder", "Escreva sua mensagem...")}
        className="flex-1 min-h-[200px] rounded-lg border border-border bg-bg-secondary p-3 text-sm text-text-primary placeholder:text-text-secondary/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
      />

      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={handleSave} disabled={saving}>
          <Save size={14} />
          <span>{saving ? t("common.saving", "Salvando...") : t("common.saveDraft", "Salvar rascunho")}</span>
        </Button>
        <Button variant="primary" size="sm" onClick={handleSend} disabled={sending || !to || !body}>
          <Send size={14} />
          <span>{sending ? t("common.sending", "Enviando...") : t("communication.send", "Enviar")}</span>
        </Button>
      </div>
    </div>
  );
}
