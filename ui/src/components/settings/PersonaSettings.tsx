import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, Save, BarChart3 } from "lucide-react";
import Button from "../shared/Button";
import Select from "../shared/Select";
import Input from "../shared/Input";
import Spinner from "../shared/Spinner";

type PersonaConfig = {
  tone: string;
  language: string;
  detailLevel: string;
  customInstructions?: string;
};

const api = () => (window as any).codexAgent;

export default function PersonaSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<PersonaConfig | null>(null);
  const [stats, setStats] = useState<{ positive: number; negative: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api().persona.get().then(setConfig).catch(() =>
      setConfig({ tone: "friendly", language: "pt-BR", detailLevel: "balanced" })
    );
    void api().feedback.stats().then(setStats).catch(() => {});
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      await api().persona.save(config);
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return <div className="flex items-center justify-center p-8"><Spinner size="lg" /></div>;
  }

  const toneOptions = [
    { value: "formal", label: t("persona.formal", "Formal") },
    { value: "casual", label: t("persona.casual", "Casual") },
    { value: "technical", label: t("persona.technical", "Técnico") },
    { value: "friendly", label: t("persona.friendly", "Amigável") },
  ];

  const detailOptions = [
    { value: "concise", label: t("persona.concise", "Conciso") },
    { value: "balanced", label: t("persona.balanced", "Equilibrado") },
    { value: "detailed", label: t("persona.detailed", "Detalhado") },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <User size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">
          {t("persona.title", "Personalização do Agente")}
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-text-secondary mb-1 block">{t("persona.tone", "Tom")}</label>
          <Select value={config.tone} onChange={(v) => setConfig({ ...config, tone: v })} options={toneOptions} />
        </div>

        <div>
          <label className="text-xs text-text-secondary mb-1 block">{t("persona.detailLevel", "Nível de detalhe")}</label>
          <Select value={config.detailLevel} onChange={(v) => setConfig({ ...config, detailLevel: v })} options={detailOptions} />
        </div>

        <div>
          <label className="text-xs text-text-secondary mb-1 block">
            {t("persona.customInstructions", "Instruções personalizadas")}
          </label>
          <textarea
            value={config.customInstructions ?? ""}
            onChange={(e) => setConfig({ ...config, customInstructions: e.target.value })}
            placeholder={t("persona.customPlaceholder", "Ex: Sempre responda em português. Prefira exemplos práticos.")}
            className="w-full min-h-[80px] rounded-lg border border-border bg-bg-secondary p-2 text-sm text-text-primary placeholder:text-text-secondary/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
        <Save size={14} />
        <span>{saving ? t("common.saving", "Salvando...") : t("common.save", "Salvar")}</span>
      </Button>

      {stats && stats.total > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-3 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={14} className="text-text-secondary" />
            <span className="text-xs font-medium text-text-primary">{t("persona.feedbackStats", "Feedback")}</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-green-400">+{stats.positive}</span>
            <span className="text-red-400">-{stats.negative}</span>
            <span className="text-text-secondary">{stats.total} total</span>
          </div>
        </div>
      )}
    </div>
  );
}
