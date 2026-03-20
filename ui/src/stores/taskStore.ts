import { create } from "zustand";
import type { TaskRecord, TaskStatus } from "../../../src/types/task.js";

const api = () => (window as any).codexAgent;

type TaskState = {
  tasks: TaskRecord[];
  loaded: boolean;

  loadTasks: () => Promise<void>;
  createTask: (partial: Partial<TaskRecord>) => Promise<TaskRecord>;
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => Promise<TaskRecord | null>;
  moveTask: (taskId: string, status: TaskStatus) => Promise<TaskRecord | null>;
  completeTask: (taskId: string) => Promise<TaskRecord | null>;
  deleteTask: (taskId: string) => Promise<void>;
  getTask: (taskId: string) => TaskRecord | undefined;
};

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loaded: false,

  loadTasks: async () => {
    const tasks = await api().tasks.list({ includeDone: true });
    set({ tasks, loaded: true });
  },

  createTask: async (partial) => {
    const task = await api().tasks.create(partial);
    await get().loadTasks();
    return task;
  },

  updateTask: async (taskId, patch) => {
    const task = await api().tasks.update(taskId, patch);
    await get().loadTasks();
    return task;
  },

  moveTask: async (taskId, status) => {
    return await get().updateTask(taskId, { status });
  },

  completeTask: async (taskId) => {
    const task = await api().tasks.complete(taskId);
    await get().loadTasks();
    return task;
  },

  deleteTask: async (taskId) => {
    await api().tasks.delete(taskId);
    await get().loadTasks();
  },

  getTask: (taskId) => get().tasks.find((task) => task.id === taskId),
}));
