import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const session = {
    executeRead: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ mode: "read" })),
    executeWrite: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ mode: "write" })),
    run: vi.fn(),
    close: vi.fn(),
  };

  const driver = {
    session: vi.fn(() => session),
    close: vi.fn(),
  };

  const authBasic = vi.fn(() => ({ token: "auth" }));
  const neo4jDriver = vi.fn(() => driver);

  return { session, driver, authBasic, neo4jDriver };
});

vi.mock("neo4j-driver", () => ({
  default: {
    driver: mocks.neo4jDriver,
    auth: { basic: mocks.authBasic },
    isPath: (value: unknown) => Boolean(value && typeof value === "object" && "segments" in value),
    isDateTime: () => false,
    isInt: () => false,
    isNode: () => false,
    isRelationship: () => false,
    integer: { toNumber: (value: unknown) => Number(value) },
    types: {
      DateTime: class DateTime {
        static fromStandardDate(date: Date) {
          return { toStandardDate: () => date };
        }
      },
    },
  },
  driver: mocks.neo4jDriver,
  auth: { basic: mocks.authBasic },
  Driver: class Driver {},
  Session: class Session {},
  ManagedTransaction: class ManagedTransaction {},
}));

import {
  Neo4jClient,
  getGlobalNeo4jClient,
  setGlobalNeo4jClient,
} from "../../../src/infrastructure/neo4j/client";

afterEach(() => {
  vi.clearAllMocks();
});

describe("neo4j client", () => {
  it("creates the driver and delegates read/write sessions", async () => {
    const client = new Neo4jClient({
      uri: "bolt://example",
      user: "neo4j",
      password: "secret",
      maxConnectionPoolSize: 12,
    });

    expect(mocks.neo4jDriver).toHaveBeenCalledWith(
      "bolt://example",
      { token: "auth" },
      {
        maxConnectionPoolSize: 12,
        connectionAcquisitionTimeout: 30000,
      },
    );

    await expect(client.executeRead(async (tx) => tx)).resolves.toEqual({ mode: "read" });
    await expect(client.executeWrite(async (tx) => tx)).resolves.toEqual({ mode: "write" });
    expect(mocks.session.executeRead).toHaveBeenCalledTimes(1);
    expect(mocks.session.executeWrite).toHaveBeenCalledTimes(1);
    expect(mocks.session.close).toHaveBeenCalledTimes(2);
  });

  it("verifies connectivity, closes sessions, and exposes the global client", async () => {
    mocks.session.run.mockResolvedValueOnce(undefined);

    const client = new Neo4jClient({
      uri: "bolt://example",
      user: "neo4j",
      password: "secret",
    });

    expect(await client.verifyConnectivity()).toBe(true);
    mocks.session.run.mockRejectedValueOnce(new Error("boom"));
    await expect(client.verifyConnectivity()).resolves.toBe(false);

    setGlobalNeo4jClient(client);
    expect(getGlobalNeo4jClient()).toBe(client);
    await client.close();
    expect(mocks.driver.close).toHaveBeenCalledTimes(1);
  });
});
