import { create } from "zustand";
import type {
  WebRecipe,
  WebRecipeRecording,
  WebRecipeRunResult,
  WebRecipeStep,
  WebRecipeStepRun,
} from "../../../src/types/webRecipe.js";

const api = () => (window as any).codexAgent;

export type RecipeRunState = {
  recipeId: string;
  running: boolean;
  sessionId?: string;
  steps: WebRecipeStepRun[];
  error?: string;
  completedAt?: number;
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createDefaultStep(): WebRecipeStep {
  return {
    id: generateId(),
    label: "Abrir pagina",
    action: "browser_open",
    args: {
      url: "",
    },
  };
}

type RecipeState = {
  recipes: WebRecipe[];
  loaded: boolean;
  recording: WebRecipeRecording | null;
  runState: RecipeRunState | null;

  loadRecipes: () => Promise<void>;
  createRecipe: (partial?: Partial<WebRecipe>) => Promise<WebRecipe>;
  updateRecipe: (recipe: WebRecipe) => Promise<WebRecipe>;
  deleteRecipe: (recipeId: string) => Promise<void>;
  getRecipe: (recipeId: string) => WebRecipe | undefined;
  runRecipe: (recipeId: string, sessionId?: string) => Promise<WebRecipeRunResult>;
  startRecording: (args?: { sessionId?: string; recipeId?: string }) => Promise<WebRecipeRecording>;
  refreshRecording: (recordingId: string) => Promise<WebRecipeRecording | null>;
  stopRecording: (args: {
    recordingId: string;
    persist?: boolean;
    name?: string;
    description?: string;
    tags?: string[];
  }) => Promise<{ recording: WebRecipeRecording; recipe?: WebRecipe }>;
  clearRunState: () => void;
};

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipes: [],
  loaded: false,
  recording: null,
  runState: null,

  loadRecipes: async () => {
    const recipes = await api().recipes.list();
    set({ recipes, loaded: true });
  },

  createRecipe: async (partial) => {
    const now = Date.now();
    const recipe: WebRecipe = {
      id: partial?.id ?? generateId(),
      name: partial?.name?.trim() || "Nova web recipe",
      description: partial?.description?.trim() || "",
      steps: partial?.steps?.length ? partial.steps : [createDefaultStep()],
      tags: Array.isArray(partial?.tags) ? partial!.tags : ["browser"],
      createdAt: partial?.createdAt ?? now,
      updatedAt: now,
      lastRunAt: partial?.lastRunAt,
    };
    await api().recipes.save(recipe);
    await get().loadRecipes();
    return recipe;
  },

  updateRecipe: async (recipe) => {
    const nextRecipe: WebRecipe = {
      ...recipe,
      updatedAt: Date.now(),
    };
    await api().recipes.save(nextRecipe);
    await get().loadRecipes();
    return nextRecipe;
  },

  deleteRecipe: async (recipeId) => {
    await api().recipes.delete(recipeId);
    await get().loadRecipes();
  },

  getRecipe: (recipeId) => get().recipes.find((recipe) => recipe.id === recipeId),

  runRecipe: async (recipeId, sessionId) => {
    set({
      runState: {
        recipeId,
        running: true,
        sessionId,
        steps: [],
      },
    });

    try {
      const result = await api().recipes.run({ recipeId, sessionId });
      set({
        runState: {
          recipeId,
          running: false,
          sessionId: result.sessionId,
          steps: result.steps,
          error: result.error,
          completedAt: result.completedAt,
        },
      });
      await get().loadRecipes();
      return result;
    } catch (error) {
      set({
        runState: {
          recipeId,
          running: false,
          sessionId,
          steps: [],
          error: error instanceof Error ? error.message : String(error),
          completedAt: Date.now(),
        },
      });
      throw error;
    }
  },

  startRecording: async (args) => {
    const recording = await api().recipes.startRecording(args);
    set({ recording });
    return recording;
  },

  refreshRecording: async (recordingId) => {
    const recordings = await api().recipes.listRecordings();
    const recording = recordings.find((entry: WebRecipeRecording) => entry.recordingId === recordingId) ?? null;
    set({ recording });
    return recording;
  },

  stopRecording: async (args) => {
    const result = await api().recipes.stopRecording(args);
    set({ recording: null });
    if (result.recipe) {
      await get().loadRecipes();
    }
    return result;
  },

  clearRunState: () => {
    set({ runState: null });
  },
}));
