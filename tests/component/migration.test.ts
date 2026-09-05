import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { assertContainerRuntime, startRawComponentDatabase } from "./test-support";

await assertContainerRuntime();

async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...env, PATH: process.env.PATH },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? -1}`));
    });
  });
}

async function relationExists(
  ctx: Awaited<ReturnType<typeof startRawComponentDatabase>>,
  relationName: string,
  schema = "public",
): Promise<boolean> {
  const [row] = await ctx.db.client.unsafe<{ exists: boolean }[]>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = '${schema}'
        AND table_name = '${relationName}'
    ) AS exists
  `);
  return row?.exists ?? false;
}

async function appliedMigrationCount(
  ctx: Awaited<ReturnType<typeof startRawComponentDatabase>>,
): Promise<number> {
  const [row] = await ctx.db.client.unsafe<{ count: string }[]>(`
    SELECT COUNT(*)::text AS count
    FROM drizzle.__drizzle_migrations
  `);
  return Number(row?.count ?? 0);
}

describe("Database migrations", () => {
  let ctx: Awaited<ReturnType<typeof startRawComponentDatabase>>;

  beforeAll(async () => {
    ctx = await startRawComponentDatabase();
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("applies migrations, records them, and is repeatable", async () => {
    await runCommand("pnpm", ["db:migrate"], {
      ...process.env,
      DATABASE_URL: ctx.connectionString,
    });

    expect(await relationExists(ctx, "__drizzle_migrations", "drizzle")).toBe(true);
    expect(await relationExists(ctx, "sources")).toBe(true);
    expect(await relationExists(ctx, "chunk_embeddings")).toBe(true);
    expect(await appliedMigrationCount(ctx)).toBe(1);

    await runCommand("pnpm", ["db:migrate"], {
      ...process.env,
      DATABASE_URL: ctx.connectionString,
    });

    expect(await relationExists(ctx, "__drizzle_migrations", "drizzle")).toBe(true);
    expect(await relationExists(ctx, "sources")).toBe(true);
    expect(await relationExists(ctx, "chunk_embeddings")).toBe(true);
    expect(await appliedMigrationCount(ctx)).toBe(1);

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
});
