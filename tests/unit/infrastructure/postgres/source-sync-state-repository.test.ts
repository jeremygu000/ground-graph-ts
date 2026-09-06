import { describe, it, expect } from "vitest";
import { mapState } from "../../../../src/infrastructure/postgres/repositories/source-sync-state-repository";

const VALID_UUID_1 = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const VALID_UUID_3 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("mapState", () => {
  it("handles basic mapping", () => {
    const row = {
      id: VALID_UUID_1,
      sourceId: VALID_UUID_2,
      tenantId: VALID_UUID_3,
      syncStatus: "idle",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    };

    const result = mapState(row);
    expect(result.id).toBe(VALID_UUID_1);
    expect(result.sourceId).toBe(VALID_UUID_2);
    expect(result.tenantId).toBe(VALID_UUID_3);
    expect(result.syncStatus).toBe("idle");
    expect(result.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(result.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("handles null optional fields", () => {
    const row = {
      id: VALID_UUID_1,
      sourceId: VALID_UUID_2,
      tenantId: VALID_UUID_3,
      syncStatus: "idle",
      lastCursor: null,
      lastSyncedAt: null,
      lastChangeHash: null,
      errorMessage: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    };

    const result = mapState(row);
    expect(result.lastCursor).toBeUndefined();
    expect(result.lastSyncedAt).toBeUndefined();
    expect(result.lastChangeHash).toBeUndefined();
    expect(result.errorMessage).toBeUndefined();
  });

  it("handles undefined optional fields", () => {
    const row = {
      id: VALID_UUID_1,
      sourceId: VALID_UUID_2,
      tenantId: VALID_UUID_3,
      syncStatus: "idle",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    };

    const result = mapState(row);
    expect(result.lastCursor).toBeUndefined();
    expect(result.lastSyncedAt).toBeUndefined();
  });

  it("handles present optional fields", () => {
    const row = {
      id: VALID_UUID_1,
      sourceId: VALID_UUID_2,
      tenantId: VALID_UUID_3,
      syncStatus: "error",
      lastCursor: "cursor_123",
      lastSyncedAt: new Date("2024-06-15T10:30:00.000Z"),
      lastChangeHash: "hash_abc",
      errorMessage: "something went wrong",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-06-15T12:00:00.000Z"),
    };

    const result = mapState(row);
    expect(result.lastCursor).toBe("cursor_123");
    expect(result.lastSyncedAt).toBe("2024-06-15T10:30:00.000Z");
    expect(result.lastChangeHash).toBe("hash_abc");
    expect(result.errorMessage).toBe("something went wrong");
    expect(result.syncStatus).toBe("error");
  });

  it("converts timestamps to ISO strings", () => {
    const row = {
      id: VALID_UUID_1,
      sourceId: VALID_UUID_2,
      tenantId: VALID_UUID_3,
      syncStatus: "syncing",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-06-15T12:00:00.000Z"),
    };

    const result = mapState(row);
    expect(result.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(result.updatedAt).toBe("2024-06-15T12:00:00.000Z");
  });

  it("handles string timestamps", () => {
    const row = {
      id: VALID_UUID_1,
      sourceId: VALID_UUID_2,
      tenantId: VALID_UUID_3,
      syncStatus: "idle",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-12-31T23:59:59.999Z",
    };

    const result = mapState(row);
    expect(result.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(result.updatedAt).toBe("2024-12-31T23:59:59.999Z");
  });

  it("handles syncing status", () => {
    const row = {
      id: VALID_UUID_1,
      sourceId: VALID_UUID_2,
      tenantId: VALID_UUID_3,
      syncStatus: "syncing",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    };

    const result = mapState(row);
    expect(result.syncStatus).toBe("syncing");
  });
});
