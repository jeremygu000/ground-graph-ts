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
      include: ["src/**/*.ts", "apps/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.ts",
        "src/**/index.ts",
        "src/application/**/ports.ts",
        "src/application/**/*-port.ts",
        "apps/api/src/server.ts",
        "src/infrastructure/postgres/client.ts",
        "src/infrastructure/postgres/schema.ts",
        "src/infrastructure/postgres/repositories/**/*.ts",
        "src/infrastructure/neo4j/client.ts",
        "src/infrastructure/neo4j/graph-repository.ts",
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
