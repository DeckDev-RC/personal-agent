import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy, Check, Circle, X } from "lucide-react";
import Button from "../shared/Button";

type Challenge = {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  completed: boolean;
};

const INITIAL_CHALLENGES: Challenge[] = [
  { id: "chat", labelKey: "challenge.chat", fallbackLabel: "Enviar primeira mensagem no chat", completed: false },
  { id: "skill", labelKey: "challenge.skill", fallbackLabel: "Usar uma skill rápida", completed: false },
  { id: "task", labelKey: "challenge.task", fallbackLabel: "Criar uma tarefa", completed: false },
  { id: "context", labelKey: "challenge.context", fallbackLabel: "Criar um contexto de projeto", completed: false },
  { id: "search", labelKey: "challenge.search", fallbackLabel: "Fazer uma busca na base de conhecimento", completed: false },
];

export default function FirstDayChallenge({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const [challenges, setChallenges] = useState<Challenge[]>(INITIAL_CHALLENGES);

  const completedCount = challenges.filter((c) => c.completed).length;
  const allDone = completedCount === challenges.length;

  function toggleChallenge(id: string) {
    setChallenges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c))
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy size={16} className={allDone ? "text-yellow-400" : "text-accent-orange"} />
          <h3 className="text-sm font-semibold text-text-primary">
            {t("challenge.title", "Desafio do Primeiro Dia")}
          </h3>
          <span className="text-[10px] text-text-secondary bg-bg-primary px-1.5 py-0.5 rounded">
            {completedCount}/{challenges.length}
          </span>
        </div>
        <button onClick={onDismiss} className="text-text-secondary hover:text-text-primary cursor-pointer">
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {challenges.map((challenge) => (
          <button
            key={challenge.id}
            onClick={() => toggleChallenge(challenge.id)}
            className="flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            {challenge.completed ? (
              <Check size={14} className="text-green-400 shrink-0" />
            ) : (
              <Circle size={14} className="text-text-secondary/40 shrink-0" />
            )}
            <span className={`text-xs ${challenge.completed ? "text-text-secondary line-through" : "text-text-primary"}`}>
              {t(challenge.labelKey, challenge.fallbackLabel)}
            </span>
          </button>
        ))}
      </div>

      {allDone && (
        <div className="mt-3 text-center">
          <p className="text-xs text-yellow-400 font-medium mb-2">
            {t("challenge.allDone", "Parabéns! Desafio completo!")}
          </p>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {t("common.dismiss", "Dispensar")}
          </Button>
        </div>
      )}
    </div>
  );
}
