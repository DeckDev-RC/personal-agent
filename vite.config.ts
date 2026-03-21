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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("react-markdown") || id.includes("remark-gfm")) {
            return "markdown-vendor";
          }

          if (id.includes("pdfjs-dist")) {
            return "pdf-vendor";
          }

          if (id.includes("i18next") || id.includes("react-i18next")) {
            return "i18n-vendor";
          }

          if (id.includes("lucide-react")) {
            return "icons-vendor";
          }

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }

          if (id.includes("zustand")) {
            return "state-vendor";
          }
        },
      },
    },
  },
});

