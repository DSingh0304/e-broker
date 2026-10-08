import react from "@vitejs/plugin-react";
import path from "path";

// Vitest 3 workspace: array of project configs, matched by test.name via
// `vitest run --project <name>` (see TESTING.md §11).
const alias = {
  "@": path.resolve(__dirname, "."),
};

function project(extraTest: Record<string, unknown>) {
  return {
    plugins: [react()],
    resolve: { alias },
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
      ...extraTest,
    },
  };
}

export default [
  project({
    name: "unit",
    include: ["__tests__/unit/**/*.test.{ts,tsx}"],
  }),
  project({
    name: "integration",
    include: ["__tests__/integration/**/*.test.{ts,tsx}"],
    setupFiles: ["./__tests__/setup.ts", "./__tests__/msw/setup.ts"],
  }),
];
