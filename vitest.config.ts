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
      include: ["src/domain/**/*.ts", "src/infrastructure/health.ts", "src/infrastructure/unit-of-work.ts", "src/infrastructure/neo4j/codec.ts"],
      exclude: ["src/**/*.d.ts", "src/**/*.test.ts", "src/**/index.ts"],
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
