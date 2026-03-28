import { useTranslation } from "react-i18next";
import { Mail, CalendarPlus, FileText, ListTodo, MessageSquare, Search } from "lucide-react";
import { setRoute } from "../../router.js";

type QuickAction = {
  icon: React.ElementType;
  labelKey: string;
  fallback: string;
  action: () => void;
};

export default function CoworkQuickActions() {
  const { t } = useTranslation();

  const actions: QuickAction[] = [
    {
      icon: Mail,
      labelKey: "cowork.quick.email",
      fallback: "Redigir Email",
      action: () => setRoute("communication"),
    },
    {
      icon: CalendarPlus,
      labelKey: "cowork.quick.meeting",
      fallback: "Agendar Reuniao",
      action: () => {
        // Will be handled by CoworkView tab switch
        const event = new CustomEvent("cowork:quick-action", { detail: "new-meeting" });
        window.dispatchEvent(event);
      },
    },
    {
      icon: FileText,
      labelKey: "cowork.quick.report",
      fallback: "Criar Relatorio",
      action: () => setRoute("documents"),
    },
    {
      icon: ListTodo,
      labelKey: "cowork.quick.task",
      fallback: "Nova Tarefa",
      action: () => setRoute("tasks"),
    },
    {
      icon: MessageSquare,
      labelKey: "cowork.quick.chat",
      fallback: "Chat com IA",
      action: () => setRoute("chat"),
    },
    {
      icon: Search,
      labelKey: "cowork.quick.search",
      fallback: "Pesquisar",
      action: () => setRoute("knowledge"),
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-4">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
        {t("cowork.quickActions", "Acoes Rapidas")}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.labelKey}
              onClick={action.action}
              className="flex items-center gap-2 rounded-lg bg-bg-primary/50 px-3 py-2.5 text-xs font-medium text-text-primary hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Icon size={14} className="text-accent shrink-0" />
              <span className="truncate">{t(action.labelKey, action.fallback)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
