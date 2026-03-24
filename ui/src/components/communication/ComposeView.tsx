import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hash, Mail, MessageSquare, Save, Send, X } from "lucide-react";
import { getDraftChannel, type DraftType } from "../../../../src/types/communication.js";
import Button from "../shared/Button";
import Input from "../shared/Input";
import ChannelPicker from "./ChannelPicker";

type ComposeViewProps = {
  initialType?: DraftType;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  initialMcpServerId?: string;
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
  initialMcpServerId,
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
  const [mcpServerId, setMcpServerId] = useState<string | undefined>(initialMcpServerId);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const channel = useMemo(() => getDraftChannel(type), [type]);
  const TypeIcon = type === "email" ? Mail : type === "slack" ? Hash : MessageSquare;

  async function handleSave() {
    setSaving(true);
    try {
      const draft = draftId
        ? await api().drafts.update(draftId, { type, to, subject, body, mcpServerId })
        : await api().drafts.create({ type, to, subject, body, mcpServerId });
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
        const draft = await api().drafts.create({ type, to, subject, body, mcpServerId });
        id = draft.id;
      } else {
        await api().drafts.update(id, { type, to, subject, body, mcpServerId });
      }
      const result = await api().drafts.send(id);
      onSend?.(result);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TypeIcon size={18} className="text-accent-blue" />
          <h2 className="text-sm font-semibold text-text-primary">
            {t("communication.compose", "Nova mensagem")}
          </h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="cursor-pointer text-text-secondary hover:text-text-primary">
            <X size={16} />
          </button>
        )}
      </div>

      <ChannelPicker
        type={type}
        mcpServerId={mcpServerId}
        onTypeChange={(nextType) => {
          setType(nextType);
          setMcpServerId(undefined);
        }}
        onMcpServerIdChange={setMcpServerId}
      />

      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <label className="text-xs text-text-secondary">{channel.addressLabel}</label>
        <Input value={to} onChange={(event) => setTo(event.target.value)} placeholder={channel.addressPlaceholder} />

        {channel.requiresSubject && (
          <>
            <label className="text-xs text-text-secondary">{t("communication.subject", "Assunto")}</label>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t("communication.subjectPlaceholder", "Assunto da mensagem")}
            />
          </>
        )}
      </div>

      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("communication.bodyPlaceholder", "Escreva sua mensagem...")}
        className="min-h-[200px] flex-1 resize-none rounded-lg border border-border bg-bg-secondary p-3 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent-blue"
      />

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleSave} disabled={saving}>
          <Save size={14} />
          <span>{saving ? t("common.saving", "Salvando...") : t("common.saveDraft", "Salvar rascunho")}</span>
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSend}
          disabled={sending || !to.trim() || !body.trim() || (channel.requiresSubject && !subject.trim())}
        >
          <Send size={14} />
          <span>{sending ? t("common.sending", "Enviando...") : t("communication.send", "Enviar")}</span>
        </Button>
      </div>
    </div>
  );
}
