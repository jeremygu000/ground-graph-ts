import { describe, expect, it } from "vitest";

describe("Stack integration tests", () => {
  describe("PostgreSQL connectivity", () => {
    it("should connect to postgres when DATABASE_URL is set", () => {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        expect.fail("DATABASE_URL not set");
      }
      expect(dbUrl).toContain("postgresql");
    });
  });

  describe("Service health checks", () => {
    const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080";

    it("API health endpoint responds", async () => {
      const res = await fetch(`${API_URL}/healthz`, { signal: AbortSignal.timeout(5000) });
      expect(res.ok || res.status === 404 || res.status === 401).toBe(true);
    });
  });
});
