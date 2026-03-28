import { useTranslation } from "react-i18next";
import { Building2, Plug, ListTodo } from "lucide-react";
import { setRoute } from "../../router.js";

export default function CoworkEmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <Building2 size={32} />
      </div>

      <div className="max-w-sm space-y-2">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("cowork.empty.title", "Bem-vindo ao Cowork")}
        </h2>
        <p className="text-sm text-text-secondary">
          {t("cowork.empty.description", "Seu assistente de escritorio inteligente. Conecte seus servicos e comece a trabalhar de forma mais produtiva.")}
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={() => setRoute("mcp")}
          className="flex items-center gap-2 rounded-lg bg-accent/20 px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/30 transition-colors cursor-pointer"
        >
          <Plug size={16} />
          {t("cowork.empty.connectMcp", "Conectar servicos (Gmail, Calendar, Slack)")}
        </button>
        <button
          onClick={() => setRoute("tasks")}
          className="flex items-center gap-2 rounded-lg bg-bg-secondary px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-white/10 transition-colors cursor-pointer"
        >
          <ListTodo size={16} />
          {t("cowork.empty.createTasks", "Criar suas primeiras tarefas")}
        </button>
      </div>
    </div>
  );
}
