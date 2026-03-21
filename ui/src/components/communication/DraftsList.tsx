import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, MessageSquare, Hash, Trash2, Edit, Send, Clock } from "lucide-react";
import Button from "../shared/Button";
import Badge from "../shared/Badge";
import EmptyState from "../shared/EmptyState";
import ComposeView from "./ComposeView";

type DraftRecord = {
  id: string;
  type: string;
  to: string;
  subject: string;
  body: string;
  status: string;
  sentAt?: number;
  createdAt: number;
  updatedAt: number;
};

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
    if (!loaded) void loadDrafts();
  }, [loaded]);

  const typeIcon = (type: string) => {
    if (type === "email") return Mail;
    if (type === "slack") return Hash;
    return MessageSquare;
  };

  const statusColor = (status: string) => {
    if (status === "sent") return "green";
    if (status === "failed") return "red";
    return "yellow";
  };

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
        initialType={editingDraft?.type as any ?? "email"}
        initialTo={editingDraft?.to ?? ""}
        initialSubject={editingDraft?.subject ?? ""}
        initialBody={editingDraft?.body ?? ""}
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
    <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto">
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
          description={t("communication.noDraftsDesc", "Crie uma nova mensagem para começar.")}
        />
      )}

      <div className="flex flex-col gap-2">
        {drafts.map((draft) => {
          const Icon = typeIcon(draft.type);
          return (
            <div
              key={draft.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-bg-secondary p-3 hover:bg-white/5 transition-colors"
            >
              <Icon size={16} className="text-text-secondary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary truncate">{draft.to || "(sem destinatário)"}</span>
                  <Badge color={statusColor(draft.status)} size="sm">{draft.status}</Badge>
                </div>
                {draft.subject && (
                  <p className="text-xs text-text-secondary truncate mt-0.5">{draft.subject}</p>
                )}
                <p className="text-xs text-text-secondary/70 truncate mt-0.5">{draft.body.slice(0, 100)}</p>
                <div className="flex items-center gap-1 mt-1 text-[10px] text-text-secondary/50">
                  <Clock size={10} />
                  <span>{new Date(draft.updatedAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {draft.status === "draft" && (
                  <>
                    <button onClick={() => setEditingDraft(draft)} className="text-text-secondary hover:text-text-primary p-1 cursor-pointer">
                      <Edit size={14} />
                    </button>
                    <button onClick={() => handleSend(draft.id)} className="text-text-secondary hover:text-accent p-1 cursor-pointer">
                      <Send size={14} />
                    </button>
                  </>
                )}
                <button onClick={() => handleDelete(draft.id)} className="text-text-secondary hover:text-red-400 p-1 cursor-pointer">
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
