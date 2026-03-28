import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Send, Clock, AlertCircle } from "lucide-react";
import { create } from "zustand";
import Badge from "../shared/Badge.js";
import Button from "../shared/Button.js";
import { setRoute } from "../../router.js";

const api = () => (window as any).codexAgent;

type DraftItem = {
  id: string;
  type: string;
  to: string;
  subject: string;
  body: string;
  status: string;
  updatedAt: number;
};

type CommState = {
  drafts: DraftItem[];
  sent: DraftItem[];
  loaded: boolean;
  load: () => Promise<void>;
};

const useCommStore = create<CommState>((set) => ({
  drafts: [],
  sent: [],
  loaded: false,
  load: async () => {
    try {
      const [drafts, sent] = await Promise.all([
        api().drafts.list({ status: "draft" }),
        api().drafts.list({ status: "sent" }),
      ]);
      set({ drafts: drafts ?? [], sent: (sent ?? []).slice(0, 10), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));

export default function CoworkCommunications() {
  const { t } = useTranslation();
  const { drafts, sent, loaded, load } = useCommStore();

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {t("cowork.comms.title", "Comunicacao")}
        </h2>
        <Button size="sm" onClick={() => setRoute("communication")}>
          <Mail size={14} className="mr-1.5" />
          {t("cowork.comms.compose", "Compor")}
        </Button>
      </div>

      {/* Pending drafts */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t("cowork.comms.drafts", "Rascunhos Pendentes")} ({drafts.length})
        </p>
        {drafts.length === 0 && (
          <p className="text-xs text-text-secondary py-4 text-center">
            {t("cowork.comms.noDrafts", "Nenhum rascunho pendente")}
          </p>
        )}
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-lg border border-border bg-bg-primary/50 p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">
                  {draft.subject || draft.to || "Sem assunto"}
                </p>
                <p className="text-[10px] text-text-secondary truncate">{draft.to}</p>
              </div>
              <Badge color="orange">
                <Clock size={10} className="mr-1" />
                {draft.type}
              </Badge>
            </div>
            {draft.body && (
              <p className="text-[10px] text-text-secondary line-clamp-2">{draft.body.slice(0, 120)}</p>
            )}
          </div>
        ))}
      </div>

      {/* Sent messages */}
      {sent.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {t("cowork.comms.sent", "Enviadas Recentemente")}
          </p>
          {sent.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs text-text-secondary py-1">
              <Send size={12} className="text-ok shrink-0" />
              <span className="truncate">{item.subject || item.to}</span>
              <span className="text-[10px] shrink-0 ml-auto">
                {new Date(item.updatedAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
