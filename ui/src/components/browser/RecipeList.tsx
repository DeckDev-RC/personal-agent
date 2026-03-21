import React, { useEffect, useState } from "react";
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { WebRecipe } from "../../../../src/types/webRecipe.js";
import { useRecipeStore } from "../../stores/recipeStore";
import { setRoute } from "../../router";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import RecipeBuilder from "./RecipeBuilder";

function formatDate(value?: number): string {
  if (!value) {
    return "Nunca executada";
  }
  return new Date(value).toLocaleString();
}

export default function RecipeList() {
  const { recipes, loaded, loadRecipes, deleteRecipe, runRecipe, runState, clearRunState } = useRecipeStore();
  const [editing, setEditing] = useState<WebRecipe | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loaded) {
      void loadRecipes();
    }
  }, [loaded, loadRecipes]);

  if (editing || creating) {
    return (
      <RecipeBuilder
        recipe={editing ?? undefined}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Web Recipes</h1>
            <p className="text-sm text-text-secondary/75">
              Automatize sequencias de browser recorrentes como check de deploy, coleta de status e preenchimento de formularios.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} />
            Nova recipe
          </Button>
        </div>

        {recipes.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-6 py-14 text-center">
            <div className="text-sm font-medium text-text-primary">Nenhuma recipe criada</div>
            <div className="mt-2 text-xs text-text-secondary/70">
              Use o recorder para capturar passos do browser ou monte a sequencia manualmente no editor.
            </div>
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                <Plus size={14} />
                Criar primeira recipe
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {recipes.map((recipe) => {
              const isRunning = runState?.recipeId === recipe.id && runState.running;
              return (
                <div key={recipe.id} className="rounded-2xl border border-border bg-bg-secondary/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{recipe.name}</span>
                        <Badge color="gray">{recipe.steps.length} steps</Badge>
                        {recipe.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} color="blue">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      {recipe.description && (
                        <p className="mt-1 text-xs text-text-secondary/75">{recipe.description}</p>
                      )}
                      <div className="mt-2 text-[11px] text-text-secondary/60">
                        Ultima execucao: {formatDate(recipe.lastRunAt)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void runRecipe(recipe.id)}
                        className="rounded-lg p-2 text-accent-green transition-colors hover:bg-accent-green/10 cursor-pointer"
                        title="Executar recipe"
                        disabled={isRunning}
                      >
                        <Play size={14} />
                      </button>
                      <button
                        onClick={() => setEditing(recipe)}
                        className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary cursor-pointer"
                        title="Editar recipe"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => void deleteRecipe(recipe.id)}
                        className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
                        title="Excluir recipe"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {runState?.recipeId === recipe.id ? (
                    <div className="mt-4 rounded-xl border border-border bg-bg-primary/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-medium text-text-primary">
                          {runState.running ? "Executando recipe..." : runState.error ? "Execucao com erro" : "Execucao concluida"}
                        </div>
                        <div className="flex items-center gap-2">
                          {runState.sessionId ? (
                            <Button variant="ghost" size="sm" onClick={() => setRoute("chat", runState.sessionId!)}>
                              Abrir sessao
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="sm" onClick={() => clearRunState()}>
                            Limpar
                          </Button>
                        </div>
                      </div>

                      {runState.error ? (
                        <div className="mt-2 text-xs text-red-300">{runState.error}</div>
                      ) : null}

                      <div className="mt-3 space-y-2">
                        {runState.steps.map((step) => (
                          <div key={step.stepId} className="rounded-lg border border-border bg-bg-secondary/70 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-medium text-text-primary">{step.label}</div>
                              <Badge color={step.status === "completed" ? "green" : step.status === "failed" ? "red" : "blue"}>
                                {step.status}
                              </Badge>
                            </div>
                            {step.content && (
                              <pre className="mt-2 whitespace-pre-wrap text-[11px] text-text-secondary/70">
                                {step.content}
                              </pre>
                            )}
                            {step.error && (
                              <div className="mt-2 text-[11px] text-red-300">{step.error}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
