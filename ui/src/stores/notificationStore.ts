import { create } from "zustand";
import type {
  ReminderRecurrence,
  ReminderRecord,
} from "../../../src/types/reminder.js";

const api = () => (window as any).codexAgent;

function sortReminders(reminders: ReminderRecord[]): ReminderRecord[] {
  return [...reminders].sort((left, right) => {
    const leftRank =
      left.status === "pending" ? 0 : left.status === "delivered" ? 1 : 2;
    const rightRank =
      right.status === "pending" ? 0 : right.status === "delivered" ? 1 : 2;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (left.status === "pending" && right.status === "pending") {
      return left.triggerAt - right.triggerAt;
    }

    const leftTime = left.deliveredAt ?? left.acknowledgedAt ?? left.triggerAt;
    const rightTime = right.deliveredAt ?? right.acknowledgedAt ?? right.triggerAt;
    return rightTime - leftTime;
  });
}

type NotificationState = {
  reminders: ReminderRecord[];
  loaded: boolean;
  loading: boolean;
  error?: string;
  eventBridgeStarted: boolean;
  lastTriggeredReminderId?: string;

  loadReminders: () => Promise<void>;
  createReminder: (input: {
    message: string;
    triggerAt: string;
    recurring?: ReminderRecurrence;
    projectContextId?: string;
  }) => Promise<ReminderRecord>;
  acknowledgeReminder: (reminderId: string) => Promise<void>;
  cancelReminder: (reminderId: string) => Promise<void>;
  deleteReminder: (reminderId: string) => Promise<void>;
  startEventBridge: () => void;
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  reminders: [],
  loaded: false,
  loading: false,
  error: undefined,
  eventBridgeStarted: false,
  lastTriggeredReminderId: undefined,

  loadReminders: async () => {
    set({ loading: true, error: undefined });
    try {
      const reminders = await api().reminders.list({
        includeAcknowledged: true,
      });
      set({
        reminders: sortReminders(Array.isArray(reminders) ? reminders : []),
        loaded: true,
        loading: false,
        error: undefined,
      });
    } catch (error) {
      set({
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  createReminder: async (input) => {
    const reminder = await api().reminders.create({
      ...input,
      source: "manual",
    });
    await get().loadReminders();
    return reminder;
  },

  acknowledgeReminder: async (reminderId) => {
    await api().reminders.acknowledge(reminderId);
    await get().loadReminders();
  },

  cancelReminder: async (reminderId) => {
    await api().reminders.cancel(reminderId);
    await get().loadReminders();
  },

  deleteReminder: async (reminderId) => {
    await api().reminders.delete(reminderId);
    await get().loadReminders();
  },

  startEventBridge: () => {
    if (get().eventBridgeStarted) {
      return;
    }

    api().notifications.onEvent((event: any) => {
      if (event?.type === "reminder-triggered" && event?.reminder?.id) {
        set({ lastTriggeredReminderId: String(event.reminder.id) });
      }
      void get().loadReminders();
    });

    set({ eventBridgeStarted: true });
  },
}));
