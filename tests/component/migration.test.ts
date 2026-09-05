import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startComponentDatabase } from "./test-support";

describe("Database migration bootstrap", () => {
  let ctx: Awaited<ReturnType<typeof startComponentDatabase>>;

  beforeAll(async () => {
    ctx = await startComponentDatabase();
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("boots the real migration with VECTOR(1536)", async () => {
    const [row] = await ctx.db.client.unsafe<[{ column_type: string }]>(`
      SELECT format_type(a.atttypid, a.atttypmod) AS column_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'chunk_embeddings'
        AND a.attname = 'embedding'
        AND a.attnum > 0
        AND NOT a.attisdropped
    `);

    expect(row?.column_type).toBe("vector(1536)");
  });

  it("reset truncates seeded rows", async () => {
    await ctx.db.client.unsafe(
      `INSERT INTO sources (id, tenant_id, type, uri) VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'url', 'https://example.com')`,
    );
    await ctx.reset();

    const [row] = await ctx.db.client.unsafe<[{ count: number }]>(`SELECT COUNT(*)::int AS count FROM sources`);
    expect(row?.count).toBe(0);
  });
});
