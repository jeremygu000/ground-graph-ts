import { describe, expect, it, vi } from "vitest";
import {
  DefaultUnitOfWork,
  DefaultUnitOfWorkFactory,
} from "../../../src/infrastructure/unit-of-work";
import type { UnitOfWork } from "../../../src/application/unit-of-work.types";
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
    await expect(uow.rollback()).resolves.toBeUndefined();
    await expect(uow.commit()).resolves.toBeUndefined();
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

  it("supports explicit transactional commit and rollback hooks", async () => {
    const callbacks: Array<(uow: UnitOfWork) => Promise<void>> = [];
    const db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ drizzle: {} })),
      drizzle: {},
    } as unknown as Database;
    const factory = new DefaultUnitOfWorkFactory(db, {} as Neo4jClient);

    await factory.transaction(async (uow) => {
      callbacks.push(async (value) => value.commit());
      await uow.commit();
      await uow.rollback();
    });

    expect(callbacks).toHaveLength(1);
    await expect(callbacks[0]!(await factory.create())).resolves.toBeUndefined();
  });
});
