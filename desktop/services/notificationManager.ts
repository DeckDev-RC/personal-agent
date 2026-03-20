import { createRequire } from "node:module";
import type { ReminderRecord } from "../../src/types/reminder.js";

const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const { Notification, app } = electron;

let notificationWindow: Electron.BrowserWindow | null = null;

export function setNotificationWindow(window: Electron.BrowserWindow | null): void {
  notificationWindow = window;
}

export function notifyReminderTriggered(reminder: ReminderRecord): void {
  notificationWindow?.webContents.send("notifications:event", {
    type: "reminder-triggered",
    reminder,
  });

  try {
    const notification = new Notification({
      title: `${app.getName()} Reminder`,
      body: reminder.message,
    });

    notification.on("click", () => {
      if (!notificationWindow) {
        return;
      }
      if (notificationWindow.isMinimized()) {
        notificationWindow.restore();
      }
      notificationWindow.show();
      notificationWindow.focus();
    });

    notification.show();
  } catch {
    // Best-effort desktop notifications.
  }
}
