import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  Key,
  Plug,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  getDefaultModelRef,
  getProviderApiKeyPlaceholder,
  getProviderCatalogEntry,
  listProviderCatalog,
} from "../../../../src/types/model.js";
import OAuthPromptContent from "../auth/OAuthPromptContent";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import Input from "../shared/Input";
import Select from "../shared/Select";
import { useOAuthUiBridge } from "../../hooks/useOAuthUiBridge";
import { useAuthStore } from "../../stores/authStore";
import { useContextStore } from "../../stores/contextStore";
import { useRuntimeStore } from "../../stores/runtimeStore";
import { useSettingsStore, type ProviderName } from "../../stores/settingsStore";

type Step = "welcome" | "provider" | "mcp" | "context" | "done";

const STEPS: Step[] = ["welcome", "provider", "mcp", "context", "done"];

type StepMeta = {
  step: Step;
  title: string;
  description: string;
};

function StepSidebar({
  steps,
  currentStep,
}: {
  steps: readonly StepMeta[];
  currentStep: Step;
}) {
  const stepIndex = steps.findIndex((item) => item.step === currentStep);

  return (
    <div className="space-y-3">
      {steps.map((item, index) => {
        const active = item.step === currentStep;
        const complete = index < stepIndex;
        return (
          <div
            key={item.step}
            className={`rounded-2xl border px-4 py-3 transition-colors ${
              active
                ? "border-accent-blue/30 bg-accent-blue/10"
                : complete
                  ? "border-accent-green/20 bg-accent-green/[0.06]"
                  : "border-border bg-bg-secondary/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                  complete
                    ? "bg-accent-green text-black"
                    : active
                      ? "bg-accent-blue text-black"
                      : "bg-bg-primary text-text-secondary"
                }`}
              >
                {complete ? <Check size={14} /> : index + 1}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary">{item.title}</div>
                <div className="text-xs leading-relaxed text-text-secondary/70">{item.description}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingWizard({ onComplete }: { onComplete?: () => void }) {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const { login, cancelLogin, saveProviderAuth, checkAuth } = useAuthStore();
  const { createContext } = useContextStore();
  const { refreshStatus } = useRuntimeStore();
  const { progressMessage, clearProgressMessage, prompt } = useOAuthUiBridge();

  const [step, setStep] = useState<Step>("welcome");
  const [provider, setProvider] = useState<ProviderName>(settings.provider);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    getProviderCatalogEntry(settings.provider).defaultBaseUrl ??
      getProviderCatalogEntry("ollama").defaultBaseUrl ??
      "http://localhost:11434",
  );
  const [contextName, setContextName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [oauthState, setOauthState] = useState<
    "idle" | "launching" | "awaiting_browser" | "awaiting_paste" | "error"
  >("idle");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const stepIndex = STEPS.indexOf(step);
  const activeProvider = getProviderCatalogEntry(provider);
  const providerOptions = listProviderCatalog().map((entry) => ({
    value: entry.id,
    label: entry.displayName,
  }));
  const stepMeta = useMemo<StepMeta[]>(
    () => [
      {
        step: "welcome",
        title: t("onboarding.meta.welcomeTitle", "Entender o produto"),
        description: t("onboarding.meta.welcomeDescription", "Revisar o que será configurado no primeiro uso."),
      },
      {
        step: "provider",
        title: t("onboarding.meta.providerTitle", "Conectar provider"),
        description: t("onboarding.meta.providerDescription", "Escolher o backend principal e validar o acesso."),
      },
      {
        step: "mcp",
        title: t("onboarding.meta.mcpTitle", "Planejar integrações"),
        description: t("onboarding.meta.mcpDescription", "Decidir quais ferramentas externas valem conectar depois."),
      },
      {
        step: "context",
        title: t("onboarding.meta.contextTitle", "Criar contexto"),
        description: t("onboarding.meta.contextDescription", "Opcionalmente registrar o projeto principal."),
      },
      {
        step: "done",
        title: t("onboarding.meta.doneTitle", "Entrar no app"),
        description: t("onboarding.meta.doneDescription", "Abrir a interface já pronta para a primeira sessão."),
      },
    ],
    [t],
  );

  useEffect(() => {
    setProvider(settings.provider);
  }, [settings.provider]);

  useEffect(() => {
    setBaseUrl(getProviderCatalogEntry(provider).defaultBaseUrl ?? "");
    setApiKey("");
  }, [provider]);

  useEffect(() => {
    requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
  }, [step]);

  useEffect(() => {
    if (prompt.open) {
      setOauthState("awaiting_paste");
      return;
    }

    if (oauthState === "awaiting_paste" && !prompt.open) {
      setOauthState("awaiting_browser");
    }
  }, [oauthState, prompt.open]);

  useEffect(() => {
    if (progressMessage && oauthState !== "awaiting_paste") {
      setOauthState("awaiting_browser");
    }
  }, [oauthState, progressMessage]);

  const oauthStatus = useMemo(() => {
    if (oauthState === "launching") {
      return {
        color: "blue" as const,
        label: t("onboarding.oauth.launching", "Abrindo navegador"),
      };
    }
    if (oauthState === "awaiting_browser") {
      return {
        color: "blue" as const,
        label: t("onboarding.oauth.awaitingBrowser", "Aguardando autenticação"),
      };
    }
    if (oauthState === "awaiting_paste") {
      return {
        color: "orange" as const,
        label: t("onboarding.oauth.awaitingPaste", "Cole o retorno do OAuth"),
      };
    }
    if (oauthState === "error") {
      return {
        color: "red" as const,
        label: t("onboarding.oauth.error", "Falha no login"),
      };
    }
    return {
      color: "gray" as const,
      label: t("onboarding.oauth.idle", "Pronto para autenticar"),
    };
  }, [oauthState, t]);

  const oauthFlowPending = savingProvider && activeProvider.authKind === "oauth";

  function isOAuthCancellation(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /cancel/i.test(message) || /cancelad/i.test(message) || /flow ended/i.test(message);
  }

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
    clearProgressMessage();
    prompt.clear();
    setOauthState("idle");

    try {
      if (activeProvider.authKind === "apiKey" && !apiKey.trim()) {
        throw new Error(`${activeProvider.displayName} API key is required.`);
      }

      const nextModelRef = getDefaultModelRef(provider);
      await updateSettings({
        provider,
        defaultModelRef: nextModelRef,
        fastModelRef: nextModelRef,
        reviewModelRef: nextModelRef,
      });

      if (activeProvider.authKind === "oauth") {
        setOauthState("launching");
        await login(provider);
      } else if (activeProvider.authKind === "apiKey") {
        await saveProviderAuth({
          provider,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
        });
      } else {
        await saveProviderAuth({
          provider,
          baseUrl: baseUrl.trim() || undefined,
        });
      }

      next();
    } catch (error) {
      if (isOAuthCancellation(error)) {
        clearProgressMessage();
        prompt.clear();
        setOauthState("idle");
        setErrorMessage("");
        return;
      }
      setOauthState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingProvider(false);
    }
  }

  async function handleCancelProviderLogin() {
    await cancelLogin();
    clearProgressMessage();
    prompt.clear();
    setOauthState("idle");
    setErrorMessage("");
    setSavingProvider(false);
    prev();
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
      await checkAuth(useSettingsStore.getState().settings.defaultModelRef);
      await refreshStatus();
      onComplete?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-10 z-40 overflow-y-auto text-text-primary">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative flex min-h-full items-center justify-center px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-blue/8 blur-3xl" />

        <div className="relative z-10 flex w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-white/6 bg-[#090909f2] shadow-[0_32px_120px_rgba(0,0,0,0.56)] ring-1 ring-white/4 lg:max-h-[calc(100vh-5.5rem)] lg:flex-row">
          <aside className="flex min-h-0 flex-col border-b border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] lg:w-[38%] lg:border-b-0 lg:border-r">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10 lg:py-10">
              <Badge color="blue">{t("app.name")}</Badge>
              <div className="mt-6 max-w-md">
                <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
                  {t("onboarding.heroTitle", "Configure o K do seu jeito")}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary/80">
                  {t(
                    "onboarding.heroDescription",
                    "Conecte um provider, ajuste o ponto de partida do agente e entre no app com um first-run mais limpo e previsível.",
                  )}
                </p>
              </div>

              <div className="mt-8">
                <StepSidebar steps={stepMeta} currentStep={step} />
              </div>
            </div>

            <div className="shrink-0 border-t border-border/50 px-6 py-6 lg:px-10">
              <div className="rounded-2xl border border-border bg-bg-secondary/60 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <Sparkles size={16} className="text-accent-orange" />
                  {t("onboarding.valueTitle", "O que muda neste setup")}
                </div>
                <ul className="mt-3 space-y-2 text-xs leading-relaxed text-text-secondary/78">
                  <li>{t("onboarding.value1", "Provider e modelo padrão ficam sincronizados desde a primeira sessão.")}</li>
                  <li>{t("onboarding.value2", "O shell técnico só aparece depois que o fluxo inicial termina.")}</li>
                  <li>{t("onboarding.value3", "Você entra com próximos passos claros para provider, integrações e contexto.")}</li>
                </ul>
              </div>
            </div>
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-10">
            <div className="mx-auto flex min-h-full w-full max-w-2xl items-center">
              <div className="w-full rounded-[28px] border border-white/6 bg-bg-primary/80 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.4)] backdrop-blur xl:p-8">
            {step === "welcome" && (
              <section>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-green/12 text-accent-green">
                  <Rocket size={22} />
                </div>
                <h2 ref={headingRef} tabIndex={-1} className="mt-6 text-2xl font-semibold outline-none">
                  {t("onboarding.welcome", "Bem-vindo ao K")}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-secondary/80">
                  {t(
                    "onboarding.welcomeDesc",
                    "Vamos configurar o provider principal, revisar integrações opcionais e deixar o app pronto para o primeiro uso.",
                  )}
                </p>
                <div className="mt-8 flex justify-end">
                  <Button variant="primary" size="md" onClick={next}>
                    <span>{t("onboarding.start", "Começar")}</span>
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </section>
            )}

            {step === "provider" && (
              <section>
                <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <Key size={16} className="text-accent-blue" />
                  <span>{t("onboarding.providerEyebrow", "Provider principal")}</span>
                </div>
                <h2 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
                  {t("onboarding.providerTitle", "Escolha como o agente vai rodar")}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary/80">
                  {t(
                    "onboarding.providerDescription",
                    "Você pode começar com OAuth, chave de API ou runtime local. Dá para trocar depois em Configurações.",
                  )}
                </p>

                <div className="mt-6 grid gap-4">
                  <Select
                    label={t("onboarding.providerLabel", "Provider")}
                    value={provider}
                    onChange={(value) => setProvider(value as ProviderName)}
                    options={providerOptions}
                  />

                  {activeProvider.authKind === "apiKey" && (
                    <Input
                      label={t("onboarding.apiKeyLabel", "API key")}
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={getProviderApiKeyPlaceholder(provider) ?? "API key"}
                      type="password"
                    />
                  )}

                  {activeProvider.defaultBaseUrl && activeProvider.authKind !== "oauth" && (
                    <Input
                      label={t("onboarding.baseUrlLabel", "Base URL")}
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder={activeProvider.defaultBaseUrl}
                    />
                  )}

                  <div className="rounded-2xl border border-border bg-bg-secondary/60 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={oauthStatus.color}>{oauthStatus.label}</Badge>
                      <Badge color="gray">{activeProvider.displayName}</Badge>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-text-secondary/78">
                      {activeProvider.authKind === "oauth"
                        ? t("onboarding.providerOauthHint", "O login do OpenAI Codex abre o navegador e pode pedir que você cole o retorno aqui.")
                        : activeProvider.authKind === "local"
                          ? t("onboarding.providerLocalHint", `${activeProvider.displayName} usa o runtime local configurado no endpoint informado.`)
                          : t("onboarding.providerApiKeyHint", "Salve a chave de API e o endpoint padrão para ativar este provider.")}
                    </p>
                    {progressMessage && (
                      <p className="mt-3 text-xs text-text-secondary/72">{progressMessage}</p>
                    )}
                  </div>

                  {prompt.open && (
                    <div className="rounded-2xl border border-accent-orange/25 bg-accent-orange/10 p-4">
                      <OAuthPromptContent
                        message={prompt.message}
                        placeholder={prompt.placeholder}
                        value={prompt.value}
                        onChange={prompt.setValue}
                        onSubmit={prompt.submit}
                        onCancel={() => {
                          void handleCancelProviderLogin();
                        }}
                        busy={false}
                        submitLabel={t("onboarding.oauth.submit", "Enviar retorno")}
                        cancelLabel={t("common.cancel")}
                      />
                    </div>
                  )}

                  {errorMessage && (
                    <p role="alert" className="text-xs text-red-400">
                      {errorMessage}
                    </p>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={oauthFlowPending ? () => void handleCancelProviderLogin() : prev}
                    disabled={savingProvider && !oauthFlowPending}
                  >
                    <ArrowLeft size={14} />
                    <span>{oauthFlowPending ? t("common.cancel") : t("common.back", "Voltar")}</span>
                  </Button>
                  <Button variant="primary" size="md" onClick={handleSaveProvider} disabled={savingProvider}>
                    <span>{savingProvider ? t("common.loading", "Carregando...") : t("common.next", "Próximo")}</span>
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </section>
            )}

            {step === "mcp" && (
              <section>
                <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <Plug size={16} className="text-accent-green" />
                  <span>{t("onboarding.mcpEyebrow", "Ferramentas externas")}</span>
                </div>
                <h2 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
                  {t("onboarding.mcpTitle", "Conecte serviços quando fizer sentido")}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary/80">
                  {t(
                    "onboarding.mcpDesc",
                    "Slack, Gmail, Calendar, GitHub e Notion ampliam o agente, mas não são obrigatórios para começar. Você pode configurar isso depois.",
                  )}
                </p>
                <div className="mt-6 rounded-2xl border border-border bg-bg-secondary/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <ShieldCheck size={16} className="text-accent-blue" />
                    {t("onboarding.mcpCardTitle", "Recomendação")}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-text-secondary/78">
                    {t(
                      "onboarding.mcpCardDescription",
                      "Entre no app agora, valide o provider e só depois conecte MCPs de acordo com o seu fluxo real de trabalho.",
                    )}
                  </p>
                </div>
                <div className="mt-8 flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={prev}>
                    <ArrowLeft size={14} />
                    <span>{t("common.back", "Voltar")}</span>
                  </Button>
                  <Button variant="primary" size="md" onClick={next}>
                    <span>{t("common.skip", "Pular")}</span>
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </section>
            )}

            {step === "context" && (
              <section>
                <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <FolderOpen size={16} className="text-accent-blue" />
                  <span>{t("onboarding.contextEyebrow", "Contexto inicial")}</span>
                </div>
                <h2 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
                  {t("onboarding.contextTitle", "Crie um contexto de projeto opcional")}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary/80">
                  {t(
                    "onboarding.contextDesc",
                    "Se você já tem um projeto principal, registre-o agora para o agente começar com o contexto certo.",
                  )}
                </p>
                <div className="mt-6">
                  <Input
                    label={t("onboarding.contextLabel", "Nome do contexto")}
                    value={contextName}
                    onChange={(event) => setContextName(event.target.value)}
                    placeholder={t("onboarding.contextPlaceholder", "Ex.: Projeto Alpha, Cliente XYZ")}
                  />
                </div>
                {errorMessage && (
                  <p role="alert" className="mt-4 text-xs text-red-400">
                    {errorMessage}
                  </p>
                )}
                <div className="mt-8 flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={prev} disabled={savingContext}>
                    <ArrowLeft size={14} />
                    <span>{t("common.back", "Voltar")}</span>
                  </Button>
                  <Button variant="primary" size="md" onClick={handleSaveContext} disabled={savingContext}>
                    <span>
                      {savingContext
                        ? t("common.loading", "Carregando...")
                        : contextName.trim()
                          ? t("common.next", "Próximo")
                          : t("common.skip", "Pular")}
                    </span>
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </section>
            )}

            {step === "done" && (
              <section>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-green/12 text-accent-green">
                  <Check size={22} />
                </div>
                <h2 ref={headingRef} tabIndex={-1} className="mt-6 text-2xl font-semibold outline-none">
                  {t("onboarding.doneTitle", "Tudo pronto para entrar")}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary/80">
                  {t(
                    "onboarding.doneDesc",
                    "Vamos abrir o app já com provider, autenticação e runtime sincronizados para o primeiro uso.",
                  )}
                </p>
                <div className="mt-6 rounded-2xl border border-border bg-bg-secondary/60 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-text-secondary/55">
                    {t("onboarding.summaryLabel", "Resumo")}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge color="blue">{activeProvider.displayName}</Badge>
                    <Badge color={contextName.trim() ? "green" : "gray"}>
                      {contextName.trim() || t("onboarding.noContextBadge", "Sem contexto inicial")}
                    </Badge>
                  </div>
                </div>
                {errorMessage && (
                  <p role="alert" className="mt-4 text-xs text-red-400">
                    {errorMessage}
                  </p>
                )}
                <div className="mt-8 flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={prev} disabled={finishing}>
                    <ArrowLeft size={14} />
                    <span>{t("common.back", "Voltar")}</span>
                  </Button>
                  <Button variant="primary" size="md" onClick={handleFinish} disabled={finishing}>
                    <span>{finishing ? t("common.loading", "Carregando...") : t("onboarding.finish", "Começar a usar")}</span>
                    <Rocket size={14} />
                  </Button>
                </div>
              </section>
            )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
