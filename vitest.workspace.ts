import { defineWorkspace } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineWorkspace([
  {
    plugins: [react()],
    test: {
      name: "ui",
      environment: "jsdom",
      include: ["ui/src/**/*.test.{ts,tsx}"],
      setupFiles: ["./ui/src/__tests__/setup.ts"],
      globals: true,
    },
  },
  {
    test: {
      name: "desktop",
      environment: "node",
      include: ["desktop/__tests__/**/*.test.ts"],
      globals: true,
    },
  },
]);
