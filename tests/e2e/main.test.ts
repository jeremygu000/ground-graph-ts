import { describe, expect, it } from "vitest";

const E2E_API_URL = process.env.E2E_API_URL ?? "http://localhost:8080";
const E2E_AUTH_TOKEN = process.env.E2E_AUTH_TOKEN;
const E2E_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const E2E_PRINCIPAL_ID = "00000000-0000-4000-8000-0000000000a1";

describe("End-to-end tests", () => {
  describe("Query workflow E2E", () => {
    it("requires authentication", async () => {
      const res = await fetch(`${E2E_API_URL}/v1/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "test?", strategy: "hybrid" }),
      });
      expect(res.status).toBe(401);
    });

    it("executes query with valid auth", async () => {
      if (!E2E_AUTH_TOKEN) {
        expect.fail("E2E_AUTH_TOKEN environment variable not set");
      }
      const res = await fetch(`${E2E_API_URL}/v1/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${E2E_AUTH_TOKEN}`,
        },
        body: JSON.stringify({
          question: "What services exist?",
          strategy: "hybrid",
          tenantId: E2E_TENANT_ID,
          principalId: E2E_PRINCIPAL_ID,
        }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { queryId: string; status: string };
      expect(data).toHaveProperty("queryId");
      expect(data).toHaveProperty("status");
      expect(["answered", "insufficient_evidence", "refused"]).toContain(data.status);
    });

    it("returns citations with answered status", async () => {
      if (!E2E_AUTH_TOKEN) {
        expect.fail("E2E_AUTH_TOKEN environment variable not set");
      }
      const res = await fetch(`${E2E_API_URL}/v1/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${E2E_AUTH_TOKEN}`,
        },
        body: JSON.stringify({
          question: "What services depend on component X?",
          strategy: "hybrid",
          maxResults: 5,
          tenantId: E2E_TENANT_ID,
          principalId: E2E_PRINCIPAL_ID,
        }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        status: string;
        claims: unknown[];
      };
      if (data.status === "answered") {
        expect(data).toHaveProperty("claims");
        expect(Array.isArray(data.claims)).toBe(true);
      }
    });
  });

  describe("Document retrieval E2E", () => {
    it("lists documents with valid auth", async () => {
      if (!E2E_AUTH_TOKEN) {
        expect.fail("E2E_AUTH_TOKEN environment variable not set");
      }
      const res = await fetch(`${E2E_API_URL}/v1/documents?tenantId=${E2E_TENANT_ID}`, {
        headers: { Authorization: `Bearer ${E2E_AUTH_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { documents: unknown[]; total: number };
      expect(data).toHaveProperty("documents");
      expect(data).toHaveProperty("total");
    });
  });

  describe("Entity retrieval E2E", () => {
    it("lists entities with valid auth", async () => {
      if (!E2E_AUTH_TOKEN) {
        expect.fail("E2E_AUTH_TOKEN environment variable not set");
      }
      const res = await fetch(`${E2E_API_URL}/v1/entities?tenantId=${E2E_TENANT_ID}`, {
        headers: { Authorization: `Bearer ${E2E_AUTH_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { entities: unknown[]; total: number };
      expect(data).toHaveProperty("entities");
      expect(data).toHaveProperty("total");
    });
  });

  describe("Authorization boundaries E2E", () => {
    it("rejects cross-tenant access", async () => {
      if (!E2E_AUTH_TOKEN) {
        expect.fail("E2E_AUTH_TOKEN environment variable not set");
      }
      const res = await fetch(
        `${E2E_API_URL}/v1/documents?tenantId=00000000-0000-0000-0000-000000000000`,
        {
          headers: { Authorization: `Bearer ${E2E_AUTH_TOKEN}` },
        },
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
