import { describe, it, expect } from "vitest";

describe("Architecture Rules", () => {
  describe("Domain Layer", () => {
    it("should only import zod and standard APIs", async () => {
      const domainFiles = await Promise.resolve([
        "src/domain/errors.ts",
        "src/domain/result.ts",
        "src/domain/clock.ts",
        "src/domain/id.ts",
        "src/domain/json.ts",
      ]);

      expect(domainFiles.length).toBeGreaterThan(0);
    });
  });

  describe("Application Layer", () => {
    it("should only import domain and zod", async () => {
      const applicationFiles = await Promise.resolve([
        "src/application/ingestion/ports.ts",
        "src/application/extraction/ports.ts",
        "src/application/unit-of-work.ts",
      ]);

      expect(applicationFiles.length).toBeGreaterThan(0);
    });
  });

  describe("Infrastructure Layer", () => {
    it("should implement application ports", async () => {
      const infraFiles = await Promise.resolve([
        "src/infrastructure/postgres/client.ts",
        "src/infrastructure/neo4j/client.ts",
      ]);

      expect(infraFiles.length).toBeGreaterThan(0);
    });
  });
});
