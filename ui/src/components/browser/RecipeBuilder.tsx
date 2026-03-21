import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, CircleDot, Play, Plus, Save, Square, Trash2 } from "lucide-react";
import type { WebRecipe, WebRecipeStep, WebRecipeStepAction, WebRecipeStepArgValue } from "../../../../src/types/webRecipe.js";
import { useRecipeStore } from "../../stores/recipeStore";
import Button from "../shared/Button";
import Input, { TextArea } from "../shared/Input";
import Select from "../shared/Select";

const api = () => (window as any).codexAgent;

type ActionField = {
  key: string;
  label: string;
  type: "text" | "number" | "checkbox";
  placeholder?: string;
};

const ACTION_OPTIONS: Array<{ value: WebRecipeStepAction; label: string }> = [
  { value: "browser_open", label: "Abrir URL" },
  { value: "browser_click", label: "Clicar elemento" },
  { value: "browser_type", label: "Preencher campo" },
  { value: "browser_wait", label: "Aguardar" },
  { value: "browser_extract_text", label: "Extrair texto" },
  { value: "browser_snapshot", label: "Snapshot da pagina" },
  { value: "browser_screenshot", label: "Screenshot" },
  { value: "browser_close", label: "Fechar browser" },
];

const ACTION_FIELDS: Record<WebRecipeStepAction, ActionField[]> = {
  browser_open: [{ key: "url", label: "URL", type: "text", placeholder: "https://example.com" }],
  browser_click: [{ key: "selector", label: "Seletor", type: "text", placeholder: "button[type=submit]" }],
  browser_type: [
    { key: "selector", label: "Seletor", type: "text", placeholder: "input[name=email]" },
    { key: "text", label: "Texto", type: "text", placeholder: "valor a preencher" },
    { key: "submit", label: "Enviar com Enter", type: "checkbox" },
  ],
  browser_wait: [
    { key: "selector", label: "Seletor", type: "text", placeholder: ".ready" },
    { key: "text", label: "Texto esperado", type: "text", placeholder: "Deploy completed" },
    { key: "timeMs", label: "Tempo (ms)", type: "number", placeholder: "1000" },
  ],
  browser_extract_text: [{ key: "selector", label: "Seletor opcional", type: "text", placeholder: "main article" }],
  browser_snapshot: [],
  browser_screenshot: [{ key: "fullPage", label: "Pagina inteira", type: "checkbox" }],
  browser_close: [],
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultStepLabel(action: WebRecipeStepAction): string {
  return ACTION_OPTIONS.find((entry) => entry.value === action)?.label ?? "Novo passo";
}

function defaultArgs(action: WebRecipeStepAction): Record<string, WebRecipeStepArgValue> {
  return Object.fromEntries(
    ACTION_FIELDS[action].map((field) => [field.key, field.type === "checkbox" ? false : ""]),
  );
}

function createStep(action: WebRecipeStepAction = "browser_open"): WebRecipeStep {
  return {
    id: generateId(),
    label: defaultStepLabel(action),
    action,
    args: defaultArgs(action),
  };
}

function normalizeArgs(action: WebRecipeStepAction, args: Record<string, WebRecipeStepArgValue>): Record<string, WebRecipeStepArgValue> {
  const next = defaultArgs(action);
  for (const field of ACTION_FIELDS[action]) {
    const value = args[field.key];
    if (field.type === "checkbox") {
      next[field.key] = value === true;
      continue;
    }
    if (field.type === "number") {
      next[field.key] =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim()
            ? Number(value)
            : "";
      continue;
    }
    next[field.key] = typeof value === "string" ? value : value == null ? "" : String(value);
  }
  return next;
}

type RecipeBuilderProps = {
  recipe?: WebRecipe;
  onClose: () => void;
};

export default function RecipeBuilder({ recipe, onClose }: RecipeBuilderProps) {
  const { createRecipe, updateRecipe, recording, startRecording, refreshRecording, stopRecording } = useRecipeStore();
  const [name, setName] = useState(recipe?.name ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [tagsText, setTagsText] = useState((recipe?.tags ?? []).join(", "));
  const [steps, setSteps] = useState<WebRecipeStep[]>(recipe?.steps.length ? recipe.steps : [createStep()]);
  const [saving, setSaving] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [testerBusy, setTesterBusy] = useState(false);
  const [testerAction, setTesterAction] = useState<WebRecipeStepAction>("browser_open");
  const [testerArgs, setTesterArgs] = useState<Record<string, WebRecipeStepArgValue>>(defaultArgs("browser_open"));
  const [testerOutput, setTesterOutput] = useState("");

  useEffect(() => {
    setTesterArgs(defaultArgs(testerAction));
  }, [testerAction]);

  const recordingActive = useMemo(
    () => Boolean(recording && (!recipe || recording.recipeId === recipe.id || recording.recipeId == null)),
    [recording, recipe],
  );

  function updateStep(stepId: string, patch: Partial<WebRecipeStep>) {
    setSteps((current) =>
      current.map((step) => {
        if (step.id !== stepId) {
          return step;
        }
        const nextAction = (patch.action ?? step.action) as WebRecipeStepAction;
        const nextArgs = patch.args
          ? normalizeArgs(nextAction, patch.args)
          : patch.action
            ? defaultArgs(nextAction)
            : step.args;
        return {
          ...step,
          ...patch,
          action: nextAction,
          label: patch.label ?? step.label,
          args: nextArgs,
        };
      }),
    );
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    setSteps((current) => {
      const index = current.findIndex((step) => step.id === stepId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      return;
    }

    const now = Date.now();
    const tags = tagsText
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    const payload: WebRecipe = {
      id: recipe?.id ?? generateId(),
      name: name.trim(),
      description: description.trim(),
      steps,
      tags,
      createdAt: recipe?.createdAt ?? now,
      updatedAt: now,
      lastRunAt: recipe?.lastRunAt,
    };

    setSaving(true);
    try {
      if (recipe) {
        await updateRecipe(payload);
      } else {
        await createRecipe(payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleStartRecording() {
    setRecordingBusy(true);
    try {
      const nextRecording = await startRecording({ recipeId: recipe?.id });
      setTesterOutput(`Gravacao iniciada na sessao ${nextRecording.sessionId}. Use o tester abaixo para capturar passos.`);
    } finally {
      setRecordingBusy(false);
    }
  }

  async function handleStopRecording() {
    if (!recording) {
      return;
    }

    setRecordingBusy(true);
    try {
      const result = await stopRecording({
        recordingId: recording.recordingId,
        persist: false,
      });
      setSteps(result.recording.steps.length ? result.recording.steps : [createStep()]);
      setTesterOutput(`Gravacao encerrada com ${result.recording.steps.length} passo(s) capturado(s).`);
    } finally {
      setRecordingBusy(false);
    }
  }

  async function handleRunTesterAction() {
    if (!recording) {
      return;
    }

    setTesterBusy(true);
    try {
      const args = normalizeArgs(testerAction, testerArgs);
      const result = await api().browser.invoke({
        sessionId: recording.sessionId,
        action: testerAction,
        ...args,
      });
      const refreshed = await refreshRecording(recording.recordingId);
      if (refreshed?.steps?.length) {
        setSteps(refreshed.steps);
      }
      setTesterOutput(typeof result?.content === "string" ? result.content : JSON.stringify(result, null, 2));
    } catch (error) {
      setTesterOutput(error instanceof Error ? error.message : String(error));
    } finally {
      setTesterBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              {recipe ? "Editar web recipe" : "Nova web recipe"}
            </h1>
            <p className="text-xs text-text-secondary/70">
              Monte sequencias reutilizaveis de browser usando o runtime Playwright que o app ja possui.
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
          <div className="grid gap-4">
            <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} placeholder="Check deploy status" />
            <Input label="Descricao" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Abre a pagina de deploy, espera o status e extrai o texto final." />
            <TextArea
              label="Tags"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="browser, deploy, jira"
              className="min-h-20"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Recorder</div>
              <div className="text-xs text-text-secondary/70">
                Grave passos usando o tester integrado. Isso alimenta a recipe com a mesma camada de browser ja usada no runtime.
              </div>
            </div>
            <div className="flex items-center gap-2">
              {recordingActive ? (
                <Button variant="danger" size="sm" onClick={() => void handleStopRecording()} disabled={recordingBusy}>
                  <Square size={14} />
                  Parar gravacao
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => void handleStartRecording()} disabled={recordingBusy}>
                  <CircleDot size={14} />
                  Iniciar gravacao
                </Button>
              )}
            </div>
          </div>

          {recordingActive && recording ? (
            <div className="mt-4 rounded-xl border border-border bg-bg-primary/70 p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(280px,0.8fr)]">
                <div className="space-y-3">
                  <div className="text-xs text-text-secondary/65">
                    Sessao ativa: <span className="font-mono text-text-primary">{recording.sessionId}</span>
                  </div>
                  <Select
                    label="Acao"
                    value={testerAction}
                    onChange={(value) => setTesterAction(value as WebRecipeStepAction)}
                    options={ACTION_OPTIONS}
                  />
                  {ACTION_FIELDS[testerAction].map((field) =>
                    field.type === "checkbox" ? (
                      <label key={field.key} className="flex items-center gap-2 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          checked={testerArgs[field.key] === true}
                          onChange={(event) =>
                            setTesterArgs((current) => ({
                              ...current,
                              [field.key]: event.target.checked,
                            }))
                          }
                        />
                        {field.label}
                      </label>
                    ) : (
                      <Input
                        key={field.key}
                        label={field.label}
                        type={field.type === "number" ? "number" : "text"}
                        value={String(testerArgs[field.key] ?? "")}
                        placeholder={field.placeholder}
                        onChange={(event) =>
                          setTesterArgs((current) => ({
                            ...current,
                            [field.key]: field.type === "number" ? event.target.value : event.target.value,
                          }))
                        }
                      />
                    ),
                  )}
                  <div className="flex justify-end">
                    <Button variant="primary" size="sm" onClick={() => void handleRunTesterAction()} disabled={testerBusy}>
                      <Play size={14} />
                      Executar acao
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-bg-secondary/80 p-3">
                  <div className="text-xs font-medium text-text-primary">Saida do tester</div>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] text-text-secondary/75">
                    {testerOutput || "Nenhuma acao executada ainda."}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Passos</div>
              <div className="text-xs text-text-secondary/70">
                Edite a sequencia manualmente ou preencha via gravacao. Cada passo mapeia direto para uma browser tool existente.
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setSteps((current) => [...current, createStep()])}>
              <Plus size={14} />
              Adicionar passo
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <div key={step.id} className="rounded-xl border border-border bg-bg-primary/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid flex-1 gap-3 md:grid-cols-[minmax(180px,0.9fr),minmax(180px,0.7fr)]">
                    <Input
                      label={`Passo ${index + 1}`}
                      value={step.label}
                      onChange={(event) => updateStep(step.id, { label: event.target.value })}
                      placeholder="Nome curto do passo"
                    />
                    <Select
                      label="Acao"
                      value={step.action}
                      onChange={(value) => updateStep(step.id, { action: value as WebRecipeStepAction, label: defaultStepLabel(value as WebRecipeStepAction) })}
                      options={ACTION_OPTIONS}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveStep(step.id, -1)}
                      className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary cursor-pointer"
                      title="Mover para cima"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => moveStep(step.id, 1)}
                      className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary cursor-pointer"
                      title="Mover para baixo"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() =>
                        setSteps((current) => (current.length > 1 ? current.filter((entry) => entry.id !== step.id) : current))
                      }
                      className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
                      title="Remover passo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {ACTION_FIELDS[step.action].length > 0 ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {ACTION_FIELDS[step.action].map((field) =>
                      field.type === "checkbox" ? (
                        <label key={field.key} className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary/80 px-3 py-2 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={step.args[field.key] === true}
                            onChange={(event) =>
                              updateStep(step.id, {
                                args: {
                                  ...step.args,
                                  [field.key]: event.target.checked,
                                },
                              })
                            }
                          />
                          {field.label}
                        </label>
                      ) : (
                        <Input
                          key={field.key}
                          label={field.label}
                          type={field.type === "number" ? "number" : "text"}
                          value={String(step.args[field.key] ?? "")}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            updateStep(step.id, {
                              args: {
                                ...step.args,
                                [field.key]: field.type === "number" ? event.target.value : event.target.value,
                              },
                            })
                          }
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-text-secondary/60">
                    Esta acao nao precisa de argumentos.
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => void handleSave()} disabled={!name.trim() || saving}>
            <Save size={14} />
            Salvar recipe
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
