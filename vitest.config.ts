import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Base config (used when no workspace filtering applies).
// Workspace projects live in vitest.workspace.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./__tests__/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", "api/**", "ml/**", "venv/**"],
    coverage: {
      provider: "v8",
      include: ["app/**", "components/**", "lib/**"],
      exclude: ["**/*.test.*", "**/*.spec.*"],
    },
  },
});
