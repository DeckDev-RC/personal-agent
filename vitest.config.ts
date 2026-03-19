import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./ui/src/__tests__/setup.ts"],
    include: ["ui/src/**/*.test.{ts,tsx}"],
  },
});
