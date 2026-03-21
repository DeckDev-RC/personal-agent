import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, FolderOpen, Key, Plug, Rocket } from "lucide-react";
import { getDefaultModelRef } from "../../../../src/types/model.js";
import { useAuthStore } from "../../stores/authStore";
import { useContextStore } from "../../stores/contextStore";
import { useSettingsStore } from "../../stores/settingsStore";
import Button from "../shared/Button";
import Input from "../shared/Input";
import Select from "../shared/Select";

type Step = "welcome" | "provider" | "mcp" | "context" | "done";
type Provider = "openai-codex" | "anthropic" | "ollama";

const STEPS: Step[] = ["welcome", "provider", "mcp", "context", "done"];

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const { loaded, loadSettings, settings, updateSettings } = useSettingsStore();
  const { login, saveProviderAuth } = useAuthStore();
  const { createContext } = useContextStore();

  const [step, setStep] = useState<Step>("welcome");
  const [provider, setProvider] = useState<Provider>("openai-codex");
  const [apiKey, setApiKey] = useState("");
  const [contextName, setContextName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    if (!loaded) {
      void loadSettings();
    }
  }, [loaded, loadSettings]);

  useEffect(() => {
    if (loaded) {
      setProvider(settings.provider);
    }
  }, [loaded, settings.provider]);

  function next() {
    const nextIndex = Math.min(stepIndex + 1, STEPS.length - 1);
    setStep(STEPS[nextIndex]);
    setErrorMessage("");
  }

  function prev() {
    const prevIndex = Math.max(stepIndex - 1, 0);
    setStep(STEPS[prevIndex]);
    setErrorMessage("");
  }

  async function handleSaveProvider() {
    setSavingProvider(true);
    setErrorMessage("");

    try {
      if (provider === "anthropic" && !apiKey.trim()) {
        throw new Error("Anthropic API key is required.");
      }

      const nextModelRef = getDefaultModelRef(provider);
      await updateSettings({
        provider,
        defaultModelRef: nextModelRef,
        fastModelRef: nextModelRef,
        reviewModelRef: nextModelRef,
      });

      if (provider === "openai-codex") {
        await login(provider);
      } else if (provider === "anthropic") {
        await saveProviderAuth({ provider, apiKey: apiKey.trim() });
      } else {
        await saveProviderAuth({ provider, baseUrl: "http://localhost:11434" });
      }

      next();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingProvider(false);
    }
  }

  async function handleSaveContext() {
    setSavingContext(true);
    setErrorMessage("");

    try {
      if (contextName.trim()) {
        await createContext({
          name: contextName.trim(),
          description: "",
          stakeholders: [],
          decisions: [],
          links: [],
          notes: "",
        });
      }

      next();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingContext(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    setErrorMessage("");

    try {
      await updateSettings({ onboardingCompleted: true });
      onComplete();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setFinishing(false);
    }
  }

  const providerOptions = [
    { value: "openai-codex", label: "OpenAI Codex" },
    { value: "anthropic", label: "Anthropic (Claude)" },
    { value: "ollama", label: "Ollama (Local)" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-bg-primary p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((item, index) => (
            <div
              key={item}
              className={`h-2 w-2 rounded-full transition-colors ${
                index <= stepIndex ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </div>

        {step === "welcome" && (
          <div className="text-center">
            <Rocket size={40} className="mx-auto mb-4 text-accent" />
            <h1 className="mb-2 text-lg font-bold text-text-primary">
              {t("onboarding.welcome", "Bem-vindo ao OpenClaw!")}
            </h1>
            <p className="mb-6 text-sm text-text-secondary">
              {t(
                "onboarding.welcomeDesc",
                "Seu assistente de coworking pessoal. Vamos configurar em poucos passos.",
              )}
            </p>
            <Button variant="primary" size="sm" onClick={next}>
              <span>{t("onboarding.start", "Comecar")}</span>
              <ArrowRight size={14} />
            </Button>
          </div>
        )}

        {step === "provider" && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Key size={18} className="text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                {t("onboarding.providerTitle", "Configurar Provider")}
              </h2>
            </div>
            <div className="mb-4 flex flex-col gap-3">
              <Select value={provider} onChange={(value) => setProvider(value as Provider)} options={providerOptions} />
              {provider === "anthropic" && (
                <Input
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="sk-ant-..."
                  type="password"
                />
              )}
              {provider === "openai-codex" && (
                <p className="text-xs text-text-secondary">
                  {t(
                    "onboarding.providerOauthHint",
                    "O login da OpenAI Codex abre o fluxo OAuth no navegador.",
                  )}
                </p>
              )}
              {provider === "ollama" && (
                <p className="text-xs text-text-secondary">
                  {t(
                    "onboarding.providerLocalHint",
                    "Ollama usa o runtime local padrao em http://localhost:11434.",
                  )}
                </p>
              )}
              {errorMessage && <p role="alert" className="text-xs text-red-400">{errorMessage}</p>}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={prev} disabled={savingProvider}>
                <ArrowLeft size={14} />
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveProvider} disabled={savingProvider}>
                <span>{savingProvider ? t("common.loading", "Salvando") : t("common.next", "Proximo")}</span>
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {step === "mcp" && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Plug size={18} className="text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                {t("onboarding.mcpTitle", "Conectar Servicos")}
              </h2>
            </div>
            <p className="mb-4 text-xs text-text-secondary">
              {t(
                "onboarding.mcpDesc",
                "Voce pode conectar servicos como Slack, Gmail e Calendar depois nas configuracoes de MCPs. Pule esta etapa se preferir.",
              )}
            </p>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={prev}>
                <ArrowLeft size={14} />
              </Button>
              <Button variant="primary" size="sm" onClick={next}>
                <span>{t("common.skip", "Pular")}</span>
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {step === "context" && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <FolderOpen size={18} className="text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                {t("onboarding.contextTitle", "Criar Contexto de Projeto")}
              </h2>
            </div>
            <p className="mb-3 text-xs text-text-secondary">
              {t(
                "onboarding.contextDesc",
                "Contextos ajudam o agente a entender seu trabalho. Crie um para seu projeto principal.",
              )}
            </p>
            <Input
              value={contextName}
              onChange={(event) => setContextName(event.target.value)}
              placeholder={t("onboarding.contextPlaceholder", "Ex: Projeto Alpha, Cliente XYZ...")}
            />
            {errorMessage && <p role="alert" className="mt-3 text-xs text-red-400">{errorMessage}</p>}
            <div className="mt-4 flex justify-between">
              <Button variant="ghost" size="sm" onClick={prev} disabled={savingContext}>
                <ArrowLeft size={14} />
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveContext} disabled={savingContext}>
                <span>
                  {savingContext
                    ? t("common.loading", "Salvando")
                    : contextName.trim()
                      ? t("common.next", "Proximo")
                      : t("common.skip", "Pular")}
                </span>
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center">
            <Check size={40} className="mx-auto mb-4 text-green-400" />
            <h2 className="mb-2 text-lg font-bold text-text-primary">
              {t("onboarding.doneTitle", "Tudo pronto!")}
            </h2>
            <p className="mb-6 text-sm text-text-secondary">
              {t(
                "onboarding.doneDesc",
                "Seu assistente esta configurado. Explore as funcionalidades pelo menu lateral.",
              )}
            </p>
            {errorMessage && <p role="alert" className="mb-4 text-xs text-red-400">{errorMessage}</p>}
            <Button variant="primary" size="sm" onClick={handleFinish} disabled={finishing}>
              <span>{finishing ? t("common.loading", "Salvando") : t("onboarding.finish", "Comecar a usar")}</span>
              <Rocket size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
