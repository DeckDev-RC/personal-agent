import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Edit, Hash, Mail, MessageSquare, Send, Trash2 } from "lucide-react";
import { getDraftChannel, type DraftRecord } from "../../../../src/types/communication.js";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";
import ComposeView from "./ComposeView";

const api = () => (window as any).codexAgent;

export default function DraftsList() {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingDraft, setEditingDraft] = useState<DraftRecord | null>(null);
  const [composing, setComposing] = useState(false);

  async function loadDrafts() {
    const list = await api().drafts.list();
    setDrafts(list);
    setLoaded(true);
  }

  useEffect(() => {
    if (!loaded) {
      void loadDrafts();
    }
  }, [loaded]);

  function typeIcon(type: DraftRecord["type"]) {
    if (type === "email") {
      return Mail;
    }
    if (type === "slack") {
      return Hash;
    }
    return MessageSquare;
  }

  function statusColor(status: DraftRecord["status"]) {
    if (status === "sent") {
      return "green";
    }
    if (status === "failed") {
      return "red";
    }
    return "yellow";
  }

  async function handleDelete(id: string) {
    await api().drafts.delete(id);
    void loadDrafts();
  }

  async function handleSend(id: string) {
    await api().drafts.send(id);
    void loadDrafts();
  }

  if (editingDraft || composing) {
    return (
      <ComposeView
        draftId={editingDraft?.id}
        initialType={editingDraft?.type ?? "email"}
        initialTo={editingDraft?.to ?? ""}
        initialSubject={editingDraft?.subject ?? ""}
        initialBody={editingDraft?.body ?? ""}
        initialMcpServerId={editingDraft?.mcpServerId}
        onSave={() => {
          setEditingDraft(null);
          setComposing(false);
          void loadDrafts();
        }}
        onSend={() => {
          setEditingDraft(null);
          setComposing(false);
          void loadDrafts();
        }}
        onClose={() => {
          setEditingDraft(null);
          setComposing(false);
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {t("communication.drafts", "Rascunhos e Mensagens")}
        </h2>
        <Button variant="primary" size="sm" onClick={() => setComposing(true)}>
          <Mail size={14} />
          <span>{t("communication.newMessage", "Nova mensagem")}</span>
        </Button>
      </div>

      {drafts.length === 0 && loaded && (
        <EmptyState
          icon={Mail}
          title={t("communication.noDrafts", "Nenhum rascunho")}
          description={t("communication.noDraftsDesc", "Crie uma nova mensagem para comecar.")}
        />
      )}

      <div className="flex flex-col gap-2">
        {drafts.map((draft) => {
          const Icon = typeIcon(draft.type);
          const channel = getDraftChannel(draft.type);

          return (
            <div
              key={draft.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-bg-secondary p-3 transition-colors hover:bg-white/5"
            >
              <Icon size={16} className="mt-0.5 shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-text-primary">
                    {draft.to || "(sem destinatario)"}
                  </span>
                  <Badge color={statusColor(draft.status)} size="sm">
                    {draft.status}
                  </Badge>
                  <Badge color="gray" size="sm">
                    {channel.label}
                  </Badge>
                </div>
                {draft.subject && <p className="mt-0.5 truncate text-xs text-text-secondary">{draft.subject}</p>}
                <p className="mt-0.5 truncate text-xs text-text-secondary/70">{draft.body.slice(0, 100)}</p>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-text-secondary/50">
                  <Clock size={10} />
                  <span>{new Date(draft.updatedAt).toLocaleString()}</span>
                  {draft.mcpServerId && <span className="truncate">via {draft.mcpServerId}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {draft.status === "draft" && (
                  <>
                    <button
                      onClick={() => setEditingDraft(draft)}
                      className="cursor-pointer p-1 text-text-secondary hover:text-text-primary"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleSend(draft.id)}
                      className="cursor-pointer p-1 text-text-secondary hover:text-accent-blue"
                    >
                      <Send size={14} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDelete(draft.id)}
                  className="cursor-pointer p-1 text-text-secondary hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
