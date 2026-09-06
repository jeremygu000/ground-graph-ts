import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: ".coverage",
      include: [
        "src/**/*.ts",
        "apps/**/src/**/*.ts",
      ],
      exclude: [
        "**/dist/**",
        "**/*.d.ts",
        "**/*.types.ts",
        "**/*.test.ts",
        "**/index.ts",
        "src/application/health.ts",
        "src/application/unit-of-work.ts",
        "src/infrastructure/postgres/schema.ts",
        "apps/evaluation-runner/src/runner.ts",
      ],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 80,
      },
    },
    typecheck: {
      checker: "tsc",
      include: ["tests/**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
