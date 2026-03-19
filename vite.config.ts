import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Projeto React fica em `ui/`. O build vai para `ui-dist/` na raiz.
export default defineConfig({
  root: "ui",
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../ui-dist",
    emptyOutDir: true,
  },
});

