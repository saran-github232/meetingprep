import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              // pdf-parse stays external: bundling it breaks pdf.js's worker lookup
              // (it must resolve pdf.worker.mjs from node_modules at runtime).
              external: ["electron", "node:sqlite", "pdf-parse"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron",
          },
        },
      },
    }),
    renderer(),
  ],
  build: {
    outDir: "dist",
  },
});
