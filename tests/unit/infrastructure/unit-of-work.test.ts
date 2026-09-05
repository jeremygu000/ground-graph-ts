import { describe, expect, it, vi } from "vitest";
import {
  DefaultUnitOfWork,
  DefaultUnitOfWorkFactory,
} from "../../../src/infrastructure/unit-of-work";
import type { UnitOfWork } from "../../../src/application/unit-of-work";
import type { Database } from "../../../src/infrastructure/postgres/client";
import type { Neo4jClient } from "../../../src/infrastructure/neo4j/client";

describe("DefaultUnitOfWork", () => {
  it("exposes repository instances and commit guards", async () => {
    const db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ drizzle: {} })),
      drizzle: {},
    } as unknown as Database;
    const neo4j = {} as never;

    const uow = new DefaultUnitOfWork(db, neo4j);

    expect(uow.sourceRepository).toBeDefined();
    await expect(uow.commit()).resolves.toBeUndefined();
    await expect(uow.commit()).rejects.toThrow("Transaction already committed");
  });

  it("forwards transactions through the factory", async () => {
    const db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<string>) => fn({ drizzle: {} })),
      drizzle: {},
    } as unknown as Database;
    const factory = new DefaultUnitOfWorkFactory(db, {} as Neo4jClient);

    const result = await factory.transaction(async (uow: UnitOfWork) => {
      expect(uow.outboxRepository).toBeDefined();
      return "ok";
    });

    expect(result).toBe("ok");
  });
});
