import { afterEach, describe, expect, it, vi } from "vitest";

const activeSpan = {
  setAttribute: vi.fn(),
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

const tracer = {
  startActiveSpan: vi.fn(function (
    _name: string,
    _options: unknown,
    callback: (span: typeof activeSpan) => Promise<unknown>,
  ) {
    return callback(activeSpan);
  }),
};

const telemetryMocks = vi.hoisted(() => {
  const sdkInstances: Array<{
    start: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
  }> = [];

  class MockNodeSDK {
    start = vi.fn();
    shutdown = vi.fn().mockResolvedValue(undefined);

    constructor(..._args: unknown[]) {
      sdkInstances.push(this);
    }
  }

  return { sdkInstances, MockNodeSDK };
});

vi.mock("@opentelemetry/api", () => ({
  SpanKind: { INTERNAL: 0 },
  SpanStatusCode: { OK: 1, ERROR: 2 },
  trace: {
    getTracer: vi.fn(() => tracer),
    getActiveSpan: vi.fn(() => activeSpan),
  },
}));

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: telemetryMocks.MockNodeSDK,
}));

vi.mock("@opentelemetry/auto-instrumentations-node", () => ({
  getNodeAutoInstrumentations: vi.fn(() => []),
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: vi.fn((attrs: Record<string, unknown>) => attrs),
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  SEMRESATTRS_SERVICE_NAME: "service.name",
  SEMRESATTRS_SERVICE_VERSION: "service.version",
}));

import {
  initTelemetry,
  recordMetric,
  shutdownTelemetry,
  withSpan,
} from "../../../src/infrastructure/telemetry";

describe("telemetry", () => {
  afterEach(async () => {
    await shutdownTelemetry();
    telemetryMocks.sdkInstances.length = 0;
    vi.clearAllMocks();
  });

  it("initializes telemetry once and starts only when enabled", () => {
    const first = initTelemetry({
      serviceName: "ground-graph",
      serviceVersion: "1.0.0",
      otlpEndpoint: "http://localhost:4318",
      enabled: true,
    });
    const second = initTelemetry({
      serviceName: "ground-graph",
      serviceVersion: "1.0.0",
      otlpEndpoint: "http://localhost:4318",
      enabled: false,
    });

    expect(first).toBe(second);
    expect(telemetryMocks.sdkInstances).toHaveLength(1);
    expect(telemetryMocks.sdkInstances[0]?.start).toHaveBeenCalledTimes(1);
  });

  it("wraps spans and records metrics", async () => {
    await expect(
      withSpan(
        "test-span",
        async () => {
          recordMetric("rows", 7);
          return "ok";
        },
        { attributes: { tenantId: "tenant" } },
      ),
    ).resolves.toBe("ok");

    expect(tracer.startActiveSpan).toHaveBeenCalled();
    expect(activeSpan.setAttribute).toHaveBeenCalledWith("metric.rows", 7);
    expect(activeSpan.setStatus).toHaveBeenCalled();
    expect(activeSpan.end).toHaveBeenCalled();
  });

  it("records span errors and shuts down", async () => {
    await expect(
      withSpan("fail-span", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(activeSpan.recordException).toHaveBeenCalled();

    initTelemetry({
      serviceName: "ground-graph",
      serviceVersion: "1.0.0",
      otlpEndpoint: "http://localhost:4318",
      enabled: true,
    });
    await shutdownTelemetry();
    expect(telemetryMocks.sdkInstances.at(-1)?.shutdown).toHaveBeenCalled();
  });
});
