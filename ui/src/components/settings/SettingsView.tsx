import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getModelId } from "../../../../src/types/model.js";
import { useAuthStore } from "../../stores/authStore";
import { useRuntimeStore } from "../../stores/runtimeStore";
import { useSettingsStore, type ThemeMode, type ProviderName } from "../../stores/settingsStore";
import Button from "../shared/Button";
import Input, { TextArea } from "../shared/Input";
import Badge from "../shared/Badge";
import Modal from "../shared/Modal";
import Toggle from "../shared/Toggle";

const PROVIDER_MODELS: Record<ProviderName, string[]> = {
  "openai-codex": [
    "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.2",
    "gpt-5.1-codex-max", "gpt-5.1-codex-mini", "gpt-5-codex", "gpt-5-mini", "gpt-5-nano",
  ],
  anthropic: [
    "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250514",
  ],
  ollama: [
    "llama3.3", "llama3.2", "llama3.1", "codellama", "deepseek-coder-v2",
    "qwen2.5-coder", "mistral", "mixtral", "phi-4", "gemma2",
  ],
};

const PROVIDER_OPTIONS: { value: ProviderName; label: string }[] = [
  { value: "openai-codex", label: "OpenAI Codex" },
  { value: "anthropic", label: "Anthropic Claude" },
  { value: "ollama", label: "Ollama (Local)" },
];

const MODEL_OPTIONS = Object.values(PROVIDER_MODELS).flat();
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

export default function SettingsView() {
  const { t } = useTranslation();
  const {
    authenticated,
    email,
    loginBusy,
    login,
    logout,
    saveProviderAuth,
    deleteProviderAuth,
    getProviderStatus,
    checkAuth,
  } = useAuthStore();
  const { refreshStatus } = useRuntimeStore();
  const { settings, updateSettings } = useSettingsStore();

  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState<ProviderName>(settings.provider);
  const [model, setModel] = useState(getModelId(settings.defaultModelRef));
  const [reasoningEffort, setReasoningEffort] = useState(settings.reasoningEffort);
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
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");

  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [oauthInput, setOauthInput] = useState("");
  const [oauthMessage, setOauthMessage] = useState("");

  const api = () => (window as any).codexAgent;

  useEffect(() => {
    const unsub = api().onOAuthPrompt((payload: { message: string; placeholder?: string }) => {
      setOauthMessage(payload.message);
      setOauthModalOpen(true);
      setOauthInput("");
    });
    return unsub;
  }, []);

  useEffect(() => {
    setProvider(settings.provider);
    setModel(getModelId(settings.defaultModelRef));
    setReasoningEffort(settings.reasoningEffort);
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
  }, [settings]);

  useEffect(() => {
    const status = getProviderStatus(provider);
    setOllamaBaseUrl(status?.baseUrl ?? "http://localhost:11434");
    setAnthropicApiKey("");
  }, [getProviderStatus, provider]);

  const activeAuthStatus = useMemo(() => getProviderStatus(provider), [getProviderStatus, provider]);

  const normalizedContextWindow = useMemo(() => {
    const value = Number(contextWindow) || settings.contextWindow;
    return Math.min(1_000_000, Math.max(32_000, value));
  }, [contextWindow, settings.contextWindow]);

  const normalizedCompactAtTokens = useMemo(() => {
    const value = Number(compactAtTokens) || settings.compactAtTokens;
    return Math.min(normalizedContextWindow, Math.max(8_000, value));
  }, [compactAtTokens, normalizedContextWindow, settings.compactAtTokens]);

  const normalizedMaxOutputTokens = useMemo(() => {
    const value = Number(maxOutputTokens) || settings.maxOutputTokens;
    return Math.min(64_000, Math.max(256, value));
  }, [maxOutputTokens, settings.maxOutputTokens]);

  async function handleSave() {
    const selectedModelRef = `${provider}/${model.trim()}`;
    await updateSettings({
      provider,
      defaultModelRef: selectedModelRef,
      fastModelRef: selectedModelRef,
      reviewModelRef: selectedModelRef,
      reasoningEffort,
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

  async function handleSaveProviderAuth() {
    if (provider === "anthropic") {
      await saveProviderAuth({
        provider,
        apiKey: anthropicApiKey,
      });
    } else if (provider === "ollama") {
      await saveProviderAuth({
        provider,
        baseUrl: ollamaBaseUrl,
      });
    } else {
      await login(provider);
    }
    await refreshStatus();
    await checkAuth(`${provider}/${model}`);
  }

  async function handleLanguageChange(lang: "pt-BR" | "en" | "es" | "de" | "zh-CN" | "zh-TW") {
    await updateSettings({ language: lang });
  }

  async function handleThemeChange(mode: ThemeMode) {
    await updateSettings({ themeMode: mode });
  }

  function submitOAuthModal() {
    api().sendOAuthPromptResponse(oauthInput.trim());
    setOauthModalOpen(false);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-lg font-semibold text-text-primary">{t("settings.title")}</h1>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">{t("settings.auth")}</h2>
          <div className="rounded-xl border border-border bg-bg-secondary/60 p-4 space-y-3">
            <div className="flex items-center gap-3">
              {activeAuthStatus?.authenticated ? (
                <>
                  <Badge color="green">{t("settings.loggedIn")}</Badge>
                  {(activeAuthStatus.owner ?? email) && (
                    <span className="text-xs text-text-secondary">{activeAuthStatus.owner ?? email}</span>
                  )}
                </>
              ) : (
                <Badge color="orange">{t("settings.notLoggedIn")}</Badge>
              )}
              <Badge color="gray">{provider}</Badge>
            </div>

            {provider === "openai-codex" && (
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    await login(provider);
                    await refreshStatus();
                  }}
                  disabled={loginBusy}
                >
                  {t("settings.login")}
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

            {provider === "anthropic" && (
              <div className="space-y-2">
                <Input
                  label="Anthropic API Key"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  placeholder={activeAuthStatus?.configured ? "Configured. Paste a new key to replace." : "sk-ant-..."}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleSaveProviderAuth()}
                    disabled={!anthropicApiKey.trim()}
                  >
                    Save Key
                  </Button>
                  {activeAuthStatus?.configured && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        await deleteProviderAuth("anthropic");
                        await refreshStatus();
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}

            {provider === "ollama" && (
              <div className="space-y-2">
                <Input
                  label="Ollama Base URL"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                />
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => void handleSaveProviderAuth()}>
                    Save Runtime
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      setOllamaBaseUrl("http://localhost:11434");
                      await saveProviderAuth({
                        provider: "ollama",
                        baseUrl: "http://localhost:11434",
                      });
                      await refreshStatus();
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            )}

            {activeAuthStatus?.message && (
              <div className="text-[11px] text-text-secondary/70">{activeAuthStatus.message}</div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">{t("settings.theme")}</h2>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={settings.themeMode === option.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => handleThemeChange(option.value)}
              >
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">{t("settings.provider")}</label>
            <select
              value={provider}
              onChange={(e) => {
                const p = e.target.value as ProviderName;
                setProvider(p);
                // Auto-set first model for new provider
                const models = PROVIDER_MODELS[p];
                if (models && models.length > 0 && !models.includes(model)) {
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
            placeholder={PROVIDER_MODELS[provider]?.[0] ?? "gpt-5.4"}
            list="model-options"
          />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">{t("settings.thinking")}</label>
            <select
              value={reasoningEffort}
              onChange={(e) => setReasoningEffort(e.target.value as typeof reasoningEffort)}
              className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
            >
              {REASONING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label={t("settings.contextWindow")}
            value={contextWindow}
            onChange={(e) => setContextWindow(e.target.value)}
            placeholder="128000"
            list="context-window-options"
            inputMode="numeric"
          />

          <Input
            label={t("settings.compactAt")}
            value={compactAtTokens}
            onChange={(e) => setCompactAtTokens(e.target.value)}
            placeholder="96000"
            list="compact-at-options"
            inputMode="numeric"
          />

          <Input
            label={t("settings.maxOutputTokens")}
            value={maxOutputTokens}
            onChange={(e) => setMaxOutputTokens(e.target.value)}
            placeholder="4096"
            list="output-token-options"
            inputMode="numeric"
          />

          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-secondary font-medium">{t("settings.executionModes")}</label>
            <div className="flex items-center gap-2">
              <Button
                variant={planMode ? "primary" : "secondary"}
                size="sm"
                onClick={() => setPlanMode((value) => !value)}
              >
                {t("settings.planMode")} {planMode ? "ON" : "OFF"}
              </Button>
              <Button
                variant={fastMode ? "primary" : "secondary"}
                size="sm"
                onClick={() => setFastMode((value) => !value)}
              >
                {t("settings.fastMode")} {fastMode ? "ON" : "OFF"}
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-[11px] text-text-secondary/70">
            {t("settings.modelHelp")}
            <br />
            {t("settings.modelHelpFilter")}
          </div>
          <TextArea
            label={t("settings.globalSystemPrompt")}
            value={globalSystemPrompt}
            onChange={(e) => setGlobalSystemPrompt(e.target.value)}
            placeholder={t("settings.globalPromptPlaceholder")}
            className="min-h-40 font-mono text-xs"
          />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={t("settings.webSearchEndpoint")}
            value={webSearchEndpoint}
            onChange={(e) => setWebSearchEndpoint(e.target.value)}
            placeholder="https://your-search-provider/search"
          />
          <Input
            label={t("settings.webSearchApiKey")}
            value={webSearchApiKey}
            onChange={(e) => setWebSearchApiKey(e.target.value)}
            placeholder="Optional bearer token"
          />
          <Input
            label={t("settings.webSearchTimeout")}
            value={webSearchTimeoutMs}
            onChange={(e) => setWebSearchTimeoutMs(e.target.value)}
            placeholder="15000"
            inputMode="numeric"
          />
          <Input
            label={t("settings.webSearchMaxResults")}
            value={webSearchMaxResults}
            onChange={(e) => setWebSearchMaxResults(e.target.value)}
            placeholder="5"
            inputMode="numeric"
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-text-secondary">{t("settings.proactivity.title")}</h2>
            <p className="mt-1 text-xs text-text-secondary/70">{t("settings.proactivity.description")}</p>
          </div>

          <div className="rounded-xl border border-border bg-bg-secondary/60 p-4 space-y-4">
            <div className="flex flex-wrap gap-4">
              <Toggle
                checked={proactivityEnabled}
                onChange={setProactivityEnabled}
                label={t("settings.proactivity.enabled")}
              />
              <Toggle
                checked={proactivityDashboard}
                onChange={setProactivityDashboard}
                label={t("settings.proactivity.dashboard")}
                disabled={!proactivityEnabled}
              />
              <Toggle
                checked={proactivityChat}
                onChange={setProactivityChat}
                label={t("settings.proactivity.chat")}
                disabled={!proactivityEnabled}
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-text-secondary">{t("settings.proactivity.frequency.label")}</div>
              <div className="flex flex-wrap gap-2">
                {PROACTIVITY_FREQUENCIES.map((option) => (
                  <Button
                    key={option.value}
                    variant={proactivityFrequency === option.value ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setProactivityFrequency(option.value)}
                    disabled={!proactivityEnabled}
                  >
                    {t(option.labelKey)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-text-secondary">{t("settings.proactivity.types.label")}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle
                  checked={proactivityTasks}
                  onChange={setProactivityTasks}
                  label={t("settings.proactivity.types.tasks")}
                  disabled={!proactivityEnabled}
                />
                <Toggle
                  checked={proactivityRoutines}
                  onChange={setProactivityRoutines}
                  label={t("settings.proactivity.types.routines")}
                  disabled={!proactivityEnabled}
                />
                <Toggle
                  checked={proactivityContext}
                  onChange={setProactivityContext}
                  label={t("settings.proactivity.types.context")}
                  disabled={!proactivityEnabled}
                />
                <Toggle
                  checked={proactivityCommunication}
                  onChange={setProactivityCommunication}
                  label={t("settings.proactivity.types.communication")}
                  disabled={!proactivityEnabled}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">{t("settings.language")}</h2>
          <div className="flex flex-wrap gap-2">
            {([
              { code: "pt-BR", label: "Português (BR)" },
              { code: "en", label: "English" },
              { code: "es", label: "Español" },
              { code: "de", label: "Deutsch" },
              { code: "zh-CN", label: "简体中文" },
              { code: "zh-TW", label: "繁體中文" },
            ] as const).map((lang) => (
              <Button
                key={lang.code}
                variant={settings.language === lang.code ? "primary" : "secondary"}
                size="sm"
                onClick={() => handleLanguageChange(lang.code)}
              >
                {lang.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">{t("settings.shortcuts")}</h2>
          <div className="text-xs text-text-secondary/70 space-y-1">
            <div><kbd className="text-accent-blue">Ctrl+B</kbd> - {t("settings.shortcuts.sidebar")}</div>
            <div><kbd className="text-accent-blue">Ctrl+K</kbd> - {t("settings.shortcuts.commandPalette")}</div>
            <div><kbd className="text-accent-blue">Enter</kbd> - {t("settings.shortcuts.sendMessage")}</div>
            <div><kbd className="text-accent-blue">Shift+Enter</kbd> - {t("settings.shortcuts.newLine")}</div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">{t("settings.renderer")}</h2>
          <div className="text-xs text-text-secondary/70">
            {t("settings.rendererHelp")}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={handleSave}>
            {saved ? t("settings.saved") : t("settings.save")}
          </Button>
          <span className="text-[11px] text-text-secondary">
            {t("settings.contextHelp")}
          </span>
        </div>
      </div>

      <datalist id="model-options">
        {(PROVIDER_MODELS[provider] ?? MODEL_OPTIONS).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="context-window-options">
        {CONTEXT_WINDOW_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="compact-at-options">
        {COMPACT_AT_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="output-token-options">
        {OUTPUT_TOKEN_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <Modal open={oauthModalOpen} onClose={() => setOauthModalOpen(false)} title="OAuth">
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">{oauthMessage}</p>
          <Input
            value={oauthInput}
            onChange={(e) => setOauthInput(e.target.value)}
            placeholder={t("settings.oauthPlaceholder")}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOauthModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" size="sm" onClick={submitOAuthModal}>
              OK
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
