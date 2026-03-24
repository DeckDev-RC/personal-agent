import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  getModelId,
  getProviderApiKeyPlaceholder,
  getProviderCatalogEntry,
  getSupportedModelIds,
  listProviderCatalog,
} from "../../../../src/types/model.js";
import { useOAuthUiBridge } from "../../hooks/useOAuthUiBridge";
import { useAuthStore } from "../../stores/authStore";
import { useRuntimeStore } from "../../stores/runtimeStore";
import { useSettingsStore, type ThemeMode, type ProviderName } from "../../stores/settingsStore";
import OAuthPromptContent from "../auth/OAuthPromptContent";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import Input, { TextArea } from "../shared/Input";
import Modal from "../shared/Modal";
import Toggle from "../shared/Toggle";

const PROVIDER_OPTIONS = listProviderCatalog().map((entry) => ({ value: entry.id, label: entry.displayName }));
const MODEL_OPTIONS = Array.from(new Set(PROVIDER_OPTIONS.flatMap((option) => getSupportedModelIds(option.value))));
const CONTEXT_WINDOW_OPTIONS = ["128000", "256000", "512000", "1000000"];
const COMPACT_AT_OPTIONS = ["64000", "96000", "128000", "256000", "512000", "750000"];
const OUTPUT_TOKEN_OPTIONS = ["2048", "4096", "8192", "16384"];
const REASONING_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
] as const;
const PROACTIVITY_FREQUENCIES = [
  { value: "low", labelKey: "settings.proactivity.frequency.low" },
  { value: "balanced", labelKey: "settings.proactivity.frequency.balanced" },
  { value: "high", labelKey: "settings.proactivity.frequency.high" },
] as const;
const THEME_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: "dark", labelKey: "settings.themeDark" },
  { value: "light", labelKey: "settings.themeLight" },
  { value: "system", labelKey: "settings.themeSystem" },
];

function SettingsSection({
  title,
  description,
  children,
  collapsible = false,
  open = true,
  onToggle,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-secondary/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-text-primary">{title}</h2>
          {description && <p className="mt-1 text-xs leading-relaxed text-text-secondary/70">{description}</p>}
        </div>
        {collapsible && onToggle && (
          <button type="button" onClick={onToggle} className="rounded-lg border border-border px-2 py-1 text-text-secondary hover:bg-white/5 hover:text-text-primary">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>
      {(!collapsible || open) && <div className="mt-4">{children}</div>}
    </section>
  );
}

export default function SettingsView() {
  const { t } = useTranslation();
  const { email, loginBusy, login, logout, saveProviderAuth, deleteProviderAuth, testProviderConnection, getProviderStatus, checkAuth } = useAuthStore();
  const { refreshStatus } = useRuntimeStore();
  const { settings, updateSettings } = useSettingsStore();
  const { prompt } = useOAuthUiBridge();
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState<ProviderName>(settings.provider);
  const [model, setModel] = useState(getModelId(settings.defaultModelRef));
  const [reasoningEffort, setReasoningEffort] = useState(settings.reasoningEffort);
  const [approvalMode, setApprovalMode] = useState(settings.approvalMode);
  const [planMode, setPlanMode] = useState(settings.planMode);
  const [fastMode, setFastMode] = useState(settings.fastMode);
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState(settings.globalSystemPrompt);
  const [contextWindow, setContextWindow] = useState(String(settings.contextWindow));
  const [compactAtTokens, setCompactAtTokens] = useState(String(settings.compactAtTokens));
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(settings.maxOutputTokens));
  const [webSearchEndpoint, setWebSearchEndpoint] = useState(settings.webSearch.endpoint);
  const [webSearchApiKey, setWebSearchApiKey] = useState(settings.webSearch.apiKey);
  const [webSearchTimeoutMs, setWebSearchTimeoutMs] = useState(String(settings.webSearch.timeoutMs));
  const [webSearchMaxResults, setWebSearchMaxResults] = useState(String(settings.webSearch.maxResults));
  const [proactivityEnabled, setProactivityEnabled] = useState(settings.proactivity.enabled);
  const [proactivityDashboard, setProactivityDashboard] = useState(settings.proactivity.dashboard);
  const [proactivityChat, setProactivityChat] = useState(settings.proactivity.chat);
  const [proactivityFrequency, setProactivityFrequency] = useState(settings.proactivity.frequency);
  const [proactivityTasks, setProactivityTasks] = useState(settings.proactivity.suggestionTypes.tasks);
  const [proactivityRoutines, setProactivityRoutines] = useState(settings.proactivity.suggestionTypes.routines);
  const [proactivityContext, setProactivityContext] = useState(settings.proactivity.suggestionTypes.context);
  const [proactivityCommunication, setProactivityCommunication] = useState(settings.proactivity.suggestionTypes.communication);
  const [fallbackProviders, setFallbackProviders] = useState(settings.fallbackProviders);
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerBaseUrl, setProviderBaseUrl] = useState(getProviderCatalogEntry(provider).defaultBaseUrl ?? "");
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionFeedback, setConnectionFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    setProvider(settings.provider);
    setModel(getModelId(settings.defaultModelRef));
    setReasoningEffort(settings.reasoningEffort);
    setApprovalMode(settings.approvalMode);
    setPlanMode(settings.planMode);
    setFastMode(settings.fastMode);
    setGlobalSystemPrompt(settings.globalSystemPrompt);
    setContextWindow(String(settings.contextWindow));
    setCompactAtTokens(String(settings.compactAtTokens));
    setMaxOutputTokens(String(settings.maxOutputTokens));
    setWebSearchEndpoint(settings.webSearch.endpoint);
    setWebSearchApiKey(settings.webSearch.apiKey);
    setWebSearchTimeoutMs(String(settings.webSearch.timeoutMs));
    setWebSearchMaxResults(String(settings.webSearch.maxResults));
    setProactivityEnabled(settings.proactivity.enabled);
    setProactivityDashboard(settings.proactivity.dashboard);
    setProactivityChat(settings.proactivity.chat);
    setProactivityFrequency(settings.proactivity.frequency);
    setProactivityTasks(settings.proactivity.suggestionTypes.tasks);
    setProactivityRoutines(settings.proactivity.suggestionTypes.routines);
    setProactivityContext(settings.proactivity.suggestionTypes.context);
    setProactivityCommunication(settings.proactivity.suggestionTypes.communication);
    setFallbackProviders(settings.fallbackProviders);
  }, [settings]);

  useEffect(() => {
    const status = getProviderStatus(provider);
    setProviderBaseUrl(status?.baseUrl ?? getProviderCatalogEntry(provider).defaultBaseUrl ?? "");
    setProviderApiKey("");
    setConnectionFeedback(null);
  }, [getProviderStatus, provider]);

  const activeAuthStatus = useMemo(() => getProviderStatus(provider), [getProviderStatus, provider]);
  const activeProviderCatalog = useMemo(() => getProviderCatalogEntry(provider), [provider]);
  const providerModels = useMemo(() => getSupportedModelIds(provider), [provider]);
  const fallbackCandidates = useMemo(() => PROVIDER_OPTIONS.filter((option) => option.value !== provider), [provider]);
  const apiKeyPlaceholder = useMemo(() => getProviderApiKeyPlaceholder(provider), [provider]);
  const authStatusMessage = connectionFeedback?.message ?? activeAuthStatus?.validationMessage ?? activeAuthStatus?.message;
  const authStatusTone = connectionFeedback?.tone ?? (activeAuthStatus?.validationStatus === "error" ? "error" : activeAuthStatus?.validationStatus === "success" ? "success" : null);
  const canTestConnection = useMemo(() => {
    if (activeProviderCatalog.authKind === "oauth") return Boolean(activeAuthStatus?.configured);
    if (activeProviderCatalog.authKind === "apiKey") return Boolean(providerApiKey.trim() || activeAuthStatus?.configured);
    return Boolean(providerBaseUrl.trim());
  }, [activeAuthStatus?.configured, activeProviderCatalog.authKind, providerApiKey, providerBaseUrl]);
  const normalizedContextWindow = useMemo(() => Math.min(1_000_000, Math.max(32_000, Number(contextWindow) || settings.contextWindow)), [contextWindow, settings.contextWindow]);
  const normalizedCompactAtTokens = useMemo(() => Math.min(normalizedContextWindow, Math.max(8_000, Number(compactAtTokens) || settings.compactAtTokens)), [compactAtTokens, normalizedContextWindow, settings.compactAtTokens]);
  const normalizedMaxOutputTokens = useMemo(() => Math.min(64_000, Math.max(256, Number(maxOutputTokens) || settings.maxOutputTokens)), [maxOutputTokens, settings.maxOutputTokens]);

  async function handleSave() {
    const selectedModelRef = `${provider}/${model.trim()}`;
    await updateSettings({
      provider,
      fallbackProviders,
      defaultModelRef: selectedModelRef,
      fastModelRef: selectedModelRef,
      reviewModelRef: selectedModelRef,
      reasoningEffort,
      approvalMode,
      planMode,
      fastMode,
      globalSystemPrompt: globalSystemPrompt.trim(),
      contextWindow: normalizedContextWindow,
      compactAtTokens: normalizedCompactAtTokens,
      maxOutputTokens: normalizedMaxOutputTokens,
      webSearch: {
        endpoint: webSearchEndpoint.trim(),
        apiKey: webSearchApiKey.trim(),
        timeoutMs: Math.max(1000, Number(webSearchTimeoutMs) || settings.webSearch.timeoutMs),
        maxResults: Math.max(1, Number(webSearchMaxResults) || settings.webSearch.maxResults),
      },
      proactivity: {
        enabled: proactivityEnabled,
        dashboard: proactivityDashboard,
        chat: proactivityChat,
        frequency: proactivityFrequency,
        suggestionTypes: {
          tasks: proactivityTasks,
          routines: proactivityRoutines,
          context: proactivityContext,
          communication: proactivityCommunication,
        },
      },
    });
    await refreshStatus();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function persistSelectedProvider() {
    const selectedModelRef = `${provider}/${model.trim()}`;
    await updateSettings({
      provider,
      defaultModelRef: selectedModelRef,
      fastModelRef: selectedModelRef,
      reviewModelRef: selectedModelRef,
    });
  }

  async function handleSaveProviderAuth() {
    await persistSelectedProvider();
    if (provider === "openai-codex") {
      await login(provider);
    } else if (activeProviderCatalog.authKind === "apiKey") {
      await saveProviderAuth({ provider, apiKey: providerApiKey, baseUrl: providerBaseUrl.trim() || undefined });
    } else if (activeProviderCatalog.authKind === "local") {
      await saveProviderAuth({ provider, baseUrl: providerBaseUrl.trim() || undefined });
    }
    setProviderApiKey("");
    const result = await testProviderConnection({ provider, modelRef: `${provider}/${model.trim()}` });
    setConnectionFeedback({ tone: result.ok ? "success" : "error", message: result.message ?? (result.ok ? "Connection verified." : "Connection test failed.") });
    await refreshStatus();
    await checkAuth(`${provider}/${model}`);
  }

  async function handleTestConnection(useCurrentInput = true) {
    setTestingConnection(true);
    setConnectionFeedback(null);
    try {
      const currentBaseUrl = providerBaseUrl.trim();
      const savedBaseUrl = activeAuthStatus?.baseUrl?.trim() || activeProviderCatalog.defaultBaseUrl || "";
      const result = await testProviderConnection({
        provider,
        modelRef: `${provider}/${model.trim()}`,
        apiKey: useCurrentInput && activeProviderCatalog.authKind === "apiKey" && providerApiKey.trim() ? providerApiKey.trim() : undefined,
        baseUrl: useCurrentInput && currentBaseUrl && currentBaseUrl !== savedBaseUrl ? currentBaseUrl : undefined,
      });
      setConnectionFeedback({ tone: result.ok ? "success" : "error", message: result.message ?? (result.ok ? "Connection verified." : "Connection test failed.") });
      await refreshStatus();
    } finally {
      setTestingConnection(false);
    }
  }

  function toggleFallbackProvider(nextProvider: ProviderName) {
    setFallbackProviders((current) => current.includes(nextProvider) ? current.filter((item) => item !== nextProvider) : [...current, nextProvider]);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-lg font-semibold text-text-primary">{t("settings.title")}</h1>

        <SettingsSection
          title={t("settings.sections.connection", "Conexão do provider")}
          description={t("settings.sections.connectionDescription", "Defina o provider principal, valide a autenticação e ajuste o modelo padrão da conversa.")}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {activeAuthStatus?.authenticated ? (
                <>
                  <Badge color="green">{t("settings.loggedIn")}</Badge>
                  {(activeAuthStatus.owner ?? email) && <span className="text-xs text-text-secondary">{activeAuthStatus.owner ?? email}</span>}
                </>
              ) : (
                <Badge color="orange">{t("settings.notLoggedIn")}</Badge>
              )}
              <Badge color="gray">{activeProviderCatalog.displayName}</Badge>
              {activeAuthStatus?.validationStatus === "success" && <Badge color="green">{t("settings.connectionVerified", "Connection OK")}</Badge>}
              {activeAuthStatus?.validationStatus === "error" && <Badge color="red">{t("settings.connectionFailed", "Test failed")}</Badge>}
            </div>

            {provider === "openai-codex" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" onClick={() => void handleSaveProviderAuth()} disabled={loginBusy}>
                  {t("settings.login")}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void handleTestConnection(false)} disabled={!canTestConnection || loginBusy || testingConnection}>
                  {testingConnection ? t("settings.testingConnection", "Testing...") : t("settings.testConnection", "Test connection")}
                </Button>
                {activeAuthStatus?.configured && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      await logout(provider);
                      await refreshStatus();
                    }}
                  >
                    {t("settings.logout")}
                  </Button>
                )}
              </div>
            )}

            {activeProviderCatalog.authKind === "apiKey" && provider !== "openai-codex" && (
              <div className="space-y-3">
                <Input
                  label={`${activeProviderCatalog.displayName} API Key`}
                  value={providerApiKey}
                  onChange={(e) => setProviderApiKey(e.target.value)}
                  placeholder={activeAuthStatus?.configured ? "Configured. Paste a new key to replace." : (apiKeyPlaceholder ?? "API key")}
                />
                {activeProviderCatalog.defaultBaseUrl && (
                  <Input label="Base URL" value={providerBaseUrl} onChange={(e) => setProviderBaseUrl(e.target.value)} placeholder={activeProviderCatalog.defaultBaseUrl} />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => void handleSaveProviderAuth()} disabled={!providerApiKey.trim()}>
                    {t("settings.saveKey", "Save key")}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void handleTestConnection(true)} disabled={!canTestConnection || testingConnection}>
                    {testingConnection ? t("settings.testingConnection", "Testing...") : t("settings.testConnection", "Test connection")}
                  </Button>
                  {activeAuthStatus?.configured && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        await deleteProviderAuth(provider);
                        await refreshStatus();
                      }}
                    >
                      {t("settings.clearProvider", "Clear")}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {activeProviderCatalog.authKind === "local" && (
              <div className="space-y-3">
                <Input
                  label={`${activeProviderCatalog.displayName} Base URL`}
                  value={providerBaseUrl}
                  onChange={(e) => setProviderBaseUrl(e.target.value)}
                  placeholder={activeProviderCatalog.defaultBaseUrl ?? "http://localhost:11434"}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => void handleSaveProviderAuth()}>
                    {t("settings.saveRuntime", "Save runtime")}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void handleTestConnection(true)} disabled={!canTestConnection || testingConnection}>
                    {testingConnection ? t("settings.testingConnection", "Testing...") : t("settings.testConnection", "Test connection")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      const nextBaseUrl = activeProviderCatalog.defaultBaseUrl ?? "http://localhost:11434";
                      setProviderBaseUrl(nextBaseUrl);
                      await saveProviderAuth({ provider, baseUrl: nextBaseUrl });
                      await refreshStatus();
                    }}
                  >
                    {t("settings.resetProvider", "Reset")}
                  </Button>
                </div>
              </div>
            )}

            {authStatusMessage && (
              <div className={`text-[11px] ${authStatusTone === "success" ? "text-accent-green" : authStatusTone === "error" ? "text-red-400" : "text-text-secondary/70"}`}>
                {authStatusMessage}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary font-medium">{t("settings.provider")}</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    const nextProvider = e.target.value as ProviderName;
                    setProvider(nextProvider);
                    const models = getSupportedModelIds(nextProvider);
                    if (models.length > 0 && !models.includes(model)) {
                      setModel(models[0]);
                    }
                  }}
                  className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
                >
                  {PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <Input
                label={t("settings.defaultModel")}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={providerModels[0] ?? "gpt-5.4"}
                list="model-options"
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title={t("settings.sections.modelExecution", "Modelo e execução")}
          description={t("settings.sections.modelExecutionDescription", "Controle esforço de raciocínio, janela de contexto, compactação e modos de execução.")}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary font-medium">{t("settings.thinking")}</label>
              <select value={reasoningEffort} onChange={(e) => setReasoningEffort(e.target.value as typeof reasoningEffort)} className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary">
                {REASONING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <Input label={t("settings.contextWindow")} value={contextWindow} onChange={(e) => setContextWindow(e.target.value)} placeholder="128000" list="context-window-options" inputMode="numeric" />
            <Input label={t("settings.compactAt")} value={compactAtTokens} onChange={(e) => setCompactAtTokens(e.target.value)} placeholder="96000" list="compact-at-options" inputMode="numeric" />
            <Input label={t("settings.maxOutputTokens")} value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(e.target.value)} placeholder="4096" list="output-token-options" inputMode="numeric" />
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-xs text-text-secondary font-medium">{t("settings.executionModes")}</label>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant={approvalMode === "free" ? "primary" : "secondary"} size="sm" onClick={() => setApprovalMode((value) => value === "free" ? "manual" : "free")}>
                  {t("settings.freeMode", "Modo livre")} {approvalMode === "free" ? "ON" : "OFF"}
                </Button>
                <Button variant={planMode ? "primary" : "secondary"} size="sm" onClick={() => setPlanMode((value) => !value)}>
                  {t("settings.planMode")} {planMode ? "ON" : "OFF"}
                </Button>
                <Button variant={fastMode ? "primary" : "secondary"} size="sm" onClick={() => setFastMode((value) => !value)}>
                  {t("settings.fastMode")} {fastMode ? "ON" : "OFF"}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-text-secondary/70">
                {approvalMode === "free"
                  ? t("settings.freeModeEnabledHint", "Modo livre ativo: o agente executa ações que normalmente pediriam aprovação manual.")
                  : t("settings.freeModeDisabledHint", "Modo manual ativo: ações sensíveis continuam pedindo aprovação antes de executar.")}
              </p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title={t("settings.sections.interface", "Interface")}
          description={t("settings.sections.interfaceDescription", "Tema, idioma e atalhos aplicados diretamente na interface.")}
        >
          <div className="space-y-6">
            <div>
              <div className="text-xs font-medium text-text-secondary">{t("settings.theme")}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {THEME_OPTIONS.map((option) => (
                  <Button key={option.value} variant={settings.themeMode === option.value ? "primary" : "secondary"} size="sm" onClick={() => handleThemeChange(option.value)}>
                    {t(option.labelKey)}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-text-secondary">{t("settings.language")}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  { code: "pt-BR", label: "Português (BR)" },
                  { code: "en", label: "English" },
                  { code: "es", label: "Español" },
                  { code: "de", label: "Deutsch" },
                  { code: "zh-CN", label: "简体中文" },
                  { code: "zh-TW", label: "繁體中文" },
                ] as const).map((lang) => (
                  <Button key={lang.code} variant={settings.language === lang.code ? "primary" : "secondary"} size="sm" onClick={() => void updateSettings({ language: lang.code })}>
                    {lang.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-text-secondary">{t("settings.shortcuts")}</div>
              <div className="mt-2 space-y-1 text-xs text-text-secondary/70">
                <div><kbd className="text-accent-blue">Ctrl+B</kbd> - {t("settings.shortcuts.sidebar")}</div>
                <div><kbd className="text-accent-blue">Ctrl+K</kbd> - {t("settings.shortcuts.commandPalette")}</div>
                <div><kbd className="text-accent-blue">Enter</kbd> - {t("settings.shortcuts.sendMessage")}</div>
                <div><kbd className="text-accent-blue">Shift+Enter</kbd> - {t("settings.shortcuts.newLine")}</div>
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title={t("settings.sections.behavior", "Comportamento do agente")}
          description={t("settings.sections.behaviorDescription", "Instruções globais e regras para sugestões proativas no dashboard e no chat.")}
        >
          <div className="space-y-6">
            <div>
              <div className="text-[11px] text-text-secondary/70">
                {t("settings.modelHelp")}
                <br />
                {t("settings.modelHelpFilter")}
              </div>
              <TextArea label={t("settings.globalSystemPrompt")} value={globalSystemPrompt} onChange={(e) => setGlobalSystemPrompt(e.target.value)} placeholder={t("settings.globalPromptPlaceholder")} className="mt-2 min-h-40 font-mono text-xs" />
            </div>

            <div>
              <div className="text-xs font-medium text-text-secondary">{t("settings.proactivity.title")}</div>
              <p className="mt-1 text-xs text-text-secondary/70">{t("settings.proactivity.description")}</p>
              <div className="mt-3 space-y-4 rounded-xl border border-border bg-bg-primary/70 p-4">
                <div className="flex flex-wrap gap-4">
                  <Toggle checked={proactivityEnabled} onChange={setProactivityEnabled} label={t("settings.proactivity.enabled")} />
                  <Toggle checked={proactivityDashboard} onChange={setProactivityDashboard} label={t("settings.proactivity.dashboard")} disabled={!proactivityEnabled} />
                  <Toggle checked={proactivityChat} onChange={setProactivityChat} label={t("settings.proactivity.chat")} disabled={!proactivityEnabled} />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-text-secondary">{t("settings.proactivity.frequency.label")}</div>
                  <div className="flex flex-wrap gap-2">
                    {PROACTIVITY_FREQUENCIES.map((option) => (
                      <Button key={option.value} variant={proactivityFrequency === option.value ? "primary" : "secondary"} size="sm" onClick={() => setProactivityFrequency(option.value)} disabled={!proactivityEnabled}>
                        {t(option.labelKey)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-text-secondary">{t("settings.proactivity.types.label")}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Toggle checked={proactivityTasks} onChange={setProactivityTasks} label={t("settings.proactivity.types.tasks")} disabled={!proactivityEnabled} />
                    <Toggle checked={proactivityRoutines} onChange={setProactivityRoutines} label={t("settings.proactivity.types.routines")} disabled={!proactivityEnabled} />
                    <Toggle checked={proactivityContext} onChange={setProactivityContext} label={t("settings.proactivity.types.context")} disabled={!proactivityEnabled} />
                    <Toggle checked={proactivityCommunication} onChange={setProactivityCommunication} label={t("settings.proactivity.types.communication")} disabled={!proactivityEnabled} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title={t("settings.sections.advanced", "Avançado")}
          description={t("settings.sections.advancedDescription", "Fallbacks, busca web e outras opções menos frequentes ficam aqui para não competir com o básico.")}
          collapsible
          open={advancedOpen}
          onToggle={() => setAdvancedOpen((value) => !value)}
        >
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-text-primary">{t("settings.fallbackTitle", "Providers de fallback")}</h3>
              <p className="mt-1 text-xs text-text-secondary/70">{t("settings.fallbackDescription", "Usados em ordem quando o provider ativo falha antes de começar a transmitir saída.")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {fallbackCandidates.map((option) => {
                  const selectedIndex = fallbackProviders.indexOf(option.value);
                  return (
                    <Button key={option.value} variant={selectedIndex >= 0 ? "primary" : "secondary"} size="sm" onClick={() => toggleFallbackProvider(option.value)}>
                      {selectedIndex >= 0 ? `${selectedIndex + 1}. ` : ""}{option.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label={t("settings.webSearchEndpoint")} value={webSearchEndpoint} onChange={(e) => setWebSearchEndpoint(e.target.value)} placeholder="https://your-search-provider/search" />
              <Input label={t("settings.webSearchApiKey")} value={webSearchApiKey} onChange={(e) => setWebSearchApiKey(e.target.value)} placeholder="Optional bearer token" />
              <Input label={t("settings.webSearchTimeout")} value={webSearchTimeoutMs} onChange={(e) => setWebSearchTimeoutMs(e.target.value)} placeholder="15000" inputMode="numeric" />
              <Input label={t("settings.webSearchMaxResults")} value={webSearchMaxResults} onChange={(e) => setWebSearchMaxResults(e.target.value)} placeholder="5" inputMode="numeric" />
            </div>

            <div>
              <h3 className="text-sm font-medium text-text-primary">{t("settings.rendererTitle", "Renderer")}</h3>
              <div className="mt-1 text-xs leading-relaxed text-text-secondary/70">{t("settings.rendererHelp")}</div>
            </div>
          </div>
        </SettingsSection>

        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={handleSave}>
            {saved ? t("settings.saved") : t("settings.save")}
          </Button>
          <span className="text-[11px] text-text-secondary">{t("settings.contextHelp")}</span>
        </div>
      </div>
      <datalist id="model-options">{(providerModels.length > 0 ? providerModels : MODEL_OPTIONS).map((option) => <option key={option} value={option} />)}</datalist>
      <datalist id="context-window-options">{CONTEXT_WINDOW_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist>
      <datalist id="compact-at-options">{COMPACT_AT_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist>
      <datalist id="output-token-options">{OUTPUT_TOKEN_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist>
      <Modal open={prompt.open} onClose={prompt.clear} title="OAuth">
        <OAuthPromptContent message={prompt.message} placeholder={prompt.placeholder} value={prompt.value} onChange={prompt.setValue} onSubmit={prompt.submit} busy={loginBusy} />
      </Modal>
    </div>
  );
}
