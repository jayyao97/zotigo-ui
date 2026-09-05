import { defineConfig } from "vite";

// Sandboxed Electron preloads cannot require local CommonJS files. Bundle the
// shared client mapping while leaving Electron's restricted require available.
export default defineConfig({
  build: {
    outDir: "dist-electron/electron",
    emptyOutDir: false,
    lib: { entry: "electron/preload.ts", formats: ["cjs"], fileName: () => "preload.js" },
    rollupOptions: { external: ["electron"] },
  },
});
