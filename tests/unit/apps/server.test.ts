import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const serverMocks = vi.hoisted(() => {
  const routes = new Map<
    string,
    (request: unknown, reply: unknown) => unknown | Promise<unknown>
  >();
  const state: {
    errorHandler:
      | ((error: unknown, request: unknown, reply: unknown) => unknown | Promise<unknown>)
      | undefined;
  } = { errorHandler: undefined };

  const app = {
    register: vi.fn(async () => app),
    get: vi.fn((path: string, handler: (request: unknown, reply: unknown) => unknown) => {
      routes.set(path, handler);
    }),
    setErrorHandler: vi.fn((handler: (typeof state)["errorHandler"]) => {
      state.errorHandler = handler;
    }),
    addHook: vi.fn((name: string, handler: unknown) => {
      void name;
      void handler;
    }),
    listen: vi.fn(async () => undefined),
  };

  return { routes, state, app };
});

vi.mock("fastify", () => ({
  default: vi.fn(() => serverMocks.app),
}));

vi.mock("@fastify/cors", () => ({
  default: vi.fn(),
}));

vi.mock("@fastify/swagger", () => ({
  default: vi.fn(),
}));

vi.mock("@fastify/swagger-ui", () => ({
  default: vi.fn(),
}));

vi.mock("@/infrastructure/health", () => ({
  PostgresHealthChecker: class PostgresHealthChecker {
    constructor(readonly client: unknown) {}
  },
  Neo4jHealthChecker: class Neo4jHealthChecker {
    constructor(readonly client: unknown) {}
  },
  MinioHealthChecker: class MinioHealthChecker {
    constructor(readonly client: unknown) {}
  },
}));

vi.mock("@/infrastructure/postgres/client", () => ({
  Database: class Database {
    constructor(readonly config: unknown) {}
  },
  setGlobalDatabase: vi.fn(),
}));

vi.mock("@/infrastructure/neo4j/client", () => ({
  Neo4jClient: class Neo4jClient {
    constructor(readonly config: unknown) {}
  },
}));

vi.mock("@/infrastructure/object-storage/client", () => ({
  ObjectStorageClient: class ObjectStorageClient {
    constructor(readonly config: unknown) {}
  },
}));

const serverModule = await import("../../../apps/api/src/server");

beforeEach(() => {
  serverMocks.routes.clear();
  serverMocks.state.errorHandler = undefined;
  vi.clearAllMocks();
});

describe("api server", () => {
  it("builds the app, serves health, and reports readiness", async () => {
    const app = await serverModule.buildApp([
      { name: "postgres", check: vi.fn(async () => ({ healthy: true, latencyMs: 7 })) } as never,
      { name: "neo4j", check: vi.fn(async () => ({ healthy: false, error: "boom" })) } as never,
    ]);

    expect(app).toBe(serverMocks.app);
    expect(serverMocks.app.register).toHaveBeenCalled();
    expect(serverMocks.app.register.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(serverMocks.routes.has("/healthz")).toBe(true);
    expect(serverMocks.routes.has("/ready")).toBe(true);

    const healthz = serverMocks.routes.get("/healthz");
    const ready = serverMocks.routes.get("/ready");
    if (!healthz || !ready) {
      throw new Error("expected health routes to be registered");
    }

    const healthResponse = await healthz({}, {} as never);
    expect(healthResponse).toMatchObject({
      status: "ok",
    });

    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    await ready({}, reply as never);

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "unhealthy",
        checks: {
          postgres: { healthy: true, latencyMs: 7 },
          neo4j: { healthy: false, error: "boom" },
        },
      }),
    );
  });

  it("formats validation and unexpected errors", async () => {
    await serverModule.buildApp();
    const errorHandler = serverMocks.state.errorHandler;
    if (!errorHandler) {
      throw new Error("expected error handler to be registered");
    }

    const validationReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    const request = { log: { error: vi.fn() } };
    await errorHandler(new ZodError([]), request as never, validationReply as never);
    expect(validationReply.status).toHaveBeenCalledWith(400);
    expect(validationReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Validation Error" }),
    );

    const genericReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    await errorHandler(new Error("boom"), request as never, genericReply as never);
    expect(genericReply.status).toHaveBeenCalledWith(500);
    expect(genericReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Internal Server Error" }),
    );
  });

  it("reports degraded readiness without checkers and handles checker failures", async () => {
    const app = await serverModule.buildApp();
    const ready = serverMocks.routes.get("/ready");
    if (!ready) throw new Error("expected readiness route");
    const degradedReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    await ready({}, degradedReply as never);
    expect(degradedReply.status).toHaveBeenCalledWith(200);
    expect(degradedReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: "degraded", checks: {} }),
    );

    expect(app).toBe(serverMocks.app);
    const failingApp = await serverModule.buildApp([
      {
        name: "broken",
        check: vi.fn(async () => {
          throw new Error("connection lost");
        }),
      } as never,
    ]);
    const failingReady = serverMocks.routes.get("/ready");
    const failingReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    await failingReady!({}, failingReply as never);
    expect(failingApp).toBe(serverMocks.app);
    expect(failingReply.status).toHaveBeenCalledWith(503);
    expect(failingReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ checks: { broken: { healthy: false, error: "connection lost" } } }),
    );
  });
});
