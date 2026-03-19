import { create } from "zustand";

export type Skill = {
  id: string;
  name: string;
  description: string;
  content: string;
  type: "prompt" | "tool";
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

type SkillState = {
  skills: Skill[];
  loaded: boolean;

  loadSkills: () => Promise<void>;
  createSkill: (partial: Partial<Skill>) => Promise<Skill>;
  updateSkill: (skill: Skill) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  importSkills: () => Promise<{ ok: boolean; imported?: number; canceled?: boolean; error?: string }>;
  exportSkills: (skillIds?: string[]) => Promise<{ ok: boolean; exported?: number; canceled?: boolean; error?: string; filePath?: string }>;
  getSkill: (id: string) => Skill | undefined;
  getSkillsByIds: (ids: string[]) => Skill[];
  buildSkillsPrompt: (ids: string[]) => string;
};

const api = () => (window as any).codexAgent;

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loaded: false,

  loadSkills: async () => {
    const list = await api().store.listSkills();
    set({ skills: list, loaded: true });
  },

  createSkill: async (partial) => {
    const now = Date.now();
    const skill: Skill = {
      id: generateId(),
      name: partial.name ?? "Nova Skill",
      description: partial.description ?? "",
      content: partial.content ?? "",
      type: partial.type ?? "prompt",
      tags: partial.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await api().store.saveSkill(skill);
    await get().loadSkills();
    return skill;
  },

  updateSkill: async (skill) => {
    const updated = { ...skill, updatedAt: Date.now() };
    await api().store.saveSkill(updated);
    await get().loadSkills();
  },

  deleteSkill: async (id) => {
    await api().store.deleteSkill(id);
    await get().loadSkills();
  },

  importSkills: async () => {
    const result = await api().store.importSkills();
    if (result?.ok) {
      await get().loadSkills();
    }
    return result;
  },

  exportSkills: async (skillIds) => {
    return api().store.exportSkills(skillIds);
  },

  getSkill: (id) => {
    return get().skills.find((s) => s.id === id);
  },

  getSkillsByIds: (ids) => {
    const all = get().skills;
    return ids.map((id) => all.find((s) => s.id === id)).filter(Boolean) as Skill[];
  },

  buildSkillsPrompt: (ids) => {
    const skills = get().getSkillsByIds(ids).filter((s) => s.type === "prompt" && s.content.trim());
    if (skills.length === 0) return "";
    return (
      "\n\n---\n\n" +
      skills
        .map((s) => `## Skill: ${s.name}\n${s.content}`)
        .join("\n\n---\n\n")
    );
  },
}));
