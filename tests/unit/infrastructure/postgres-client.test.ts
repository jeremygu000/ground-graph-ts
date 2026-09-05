import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const end = vi.fn();
  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ tag: "tx" }));
  const drizzle = vi.fn(() => ({ transaction }));
  const postgres = vi.fn(() => ({ end }));
  return { end, transaction, drizzle, postgres };
});

vi.mock("postgres", () => ({
  default: mocks.postgres,
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: mocks.drizzle,
}));

import {
  Database,
  getGlobalDatabase,
  setGlobalDatabase,
} from "../../../src/infrastructure/postgres/client";

afterEach(() => {
  vi.clearAllMocks();
});

describe("postgres client", () => {
  it("constructs a postgres pool and delegates transactions", async () => {
    const db = new Database({ url: "postgresql://example", maxConnections: 4 });

    expect(mocks.postgres).toHaveBeenCalledWith("postgresql://example", {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    expect(mocks.drizzle).toHaveBeenCalledTimes(1);
    expect(db.client).toBe(mocks.postgres.mock.results[0]?.value);

    await expect(db.transaction(async (tx) => tx)).resolves.toEqual({ tag: "tx" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("closes the pool and manages the global database handle", async () => {
    const db = new Database({ url: "postgresql://example" });

    setGlobalDatabase(db);
    expect(getGlobalDatabase()).toBe(db);

    await db.close();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});
