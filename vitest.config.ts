import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        plugins: [react()],
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["ui/src/**/*.test.{ts,tsx}"],
          setupFiles: ["./ui/src/__tests__/setup.ts"],
          globals: true,
          server: {
            deps: {
              external: [/^node:/],
            },
          },
        },
      },
      {
        test: {
          name: "desktop",
          environment: "node",
          include: ["desktop/__tests__/**/*.test.ts"],
          globals: true,
          server: {
            deps: {
              external: [/^node:/],
            },
          },
        },
      },
    ],
  },
});
