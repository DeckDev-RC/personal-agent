import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ArrowRight, MessageSquare, Zap, ListTodo, Search, GitBranch } from "lucide-react";
import Button from "../shared/Button";

type TourStep = {
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
  fallbackTitle: string;
  fallbackDesc: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    icon: MessageSquare,
    titleKey: "tour.chat.title",
    descKey: "tour.chat.desc",
    fallbackTitle: "Chat com IA",
    fallbackDesc: "Converse com o agente para qualquer tarefa. Ele tem acesso a ferramentas, browser e seus serviços conectados.",
  },
  {
    icon: Zap,
    titleKey: "tour.skills.title",
    descKey: "tour.skills.desc",
    fallbackTitle: "Skills Rápidas",
    fallbackDesc: "Use skills prontas para tarefas comuns: resumir reuniões, redigir emails, pesquisar na web e muito mais.",
  },
  {
    icon: ListTodo,
    titleKey: "tour.tasks.title",
    descKey: "tour.tasks.desc",
    fallbackTitle: "Gerenciador de Tarefas",
    fallbackDesc: "Organize suas tarefas em um quadro Kanban. O agente pode criar e completar tarefas por você.",
  },
  {
    icon: GitBranch,
    titleKey: "tour.workflows.title",
    descKey: "tour.workflows.desc",
    fallbackTitle: "Workflows Automáticos",
    fallbackDesc: "Configure automações como Morning Briefing, End of Day Report e Weekly Review.",
  },
  {
    icon: Search,
    titleKey: "tour.knowledge.title",
    descKey: "tour.knowledge.desc",
    fallbackTitle: "Base de Conhecimento",
    fallbackDesc: "Busque semanticamente em tudo que o agente processou. Encontre decisões, emails e documentos antigos.",
  },
];

export default function FeatureTour({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-24 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm bg-bg-primary border border-border rounded-xl shadow-2xl p-4 animate-in slide-in-from-bottom">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/15 text-accent">
              <Icon size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {t(step.titleKey, step.fallbackTitle)}
              </h3>
              <span className="text-[10px] text-text-secondary">{currentStep + 1}/{TOUR_STEPS.length}</span>
            </div>
          </div>
          <button onClick={onComplete} className="text-text-secondary hover:text-text-primary cursor-pointer p-1">
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-text-secondary mb-3">
          {t(step.descKey, step.fallbackDesc)}
        </p>
        <div className="flex justify-between items-center">
          <div className="flex gap-1">
            {TOUR_STEPS.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= currentStep ? "bg-accent" : "bg-border"}`} />
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={handleNext}>
            <span>{isLast ? t("tour.finish", "Finalizar") : t("common.next", "Próximo")}</span>
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
