import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sdkInstances: Array<{
    start: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
  }> = [];

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

  class MockNodeSDK {
    start = vi.fn();
    shutdown = vi.fn().mockResolvedValue(undefined);

    constructor(..._args: unknown[]) {
      sdkInstances.push(this);
    }
  }

  return { activeSpan, tracer, sdkInstances, MockNodeSDK };
});

const mockMetrics = vi.hoisted(() => ({
  getMeter: vi.fn(() => ({
    createCounter: vi.fn(() => ({ add: vi.fn() })),
    createHistogram: vi.fn(() => ({ record: vi.fn() })),
    createUpDownCounter: vi.fn(() => ({ add: vi.fn() })),
  })),
  setGlobalMeterProvider: vi.fn(),
}));

vi.mock("@opentelemetry/api", () => ({
  SpanKind: { INTERNAL: 0 },
  SpanStatusCode: { OK: 1, ERROR: 2 },
  trace: {
    getTracer: vi.fn(() => mocks.tracer),
    getActiveSpan: vi.fn(() => mocks.activeSpan),
  },
  metrics: mockMetrics,
}));

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: mocks.MockNodeSDK,
}));

vi.mock("@opentelemetry/auto-instrumentations-node", () => ({
  getNodeAutoInstrumentations: vi.fn(() => []),
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/sdk-metrics", () => ({
  MeterProvider: vi.fn(),
  PeriodicExportingMetricReader: vi.fn(),
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({
  OTLPMetricExporter: vi.fn(),
}));

vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: vi.fn((attrs: Record<string, unknown>) => attrs),
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  ATTR_SERVICE_NAME: "service.name",
  ATTR_SERVICE_VERSION: "service.version",
}));

import {
  initTelemetry,
  recordMetric,
  shutdownTelemetry,
  withSpan,
} from "../../../src/infrastructure/telemetry";
import { shutdownMetrics } from "../../../src/infrastructure/telemetry/metrics";

describe("telemetry", () => {
  afterEach(async () => {
    await shutdownTelemetry();
    await shutdownMetrics();
    mocks.sdkInstances.length = 0;
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
    expect(mocks.sdkInstances).toHaveLength(1);
    expect(mocks.sdkInstances[0]?.start).toHaveBeenCalledTimes(1);
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

    expect(mocks.tracer.startActiveSpan).toHaveBeenCalled();
    expect(mocks.activeSpan.setAttribute).toHaveBeenCalled();
    expect(mocks.activeSpan.setStatus).toHaveBeenCalled();
    expect(mocks.activeSpan.end).toHaveBeenCalled();
  });

  it("records span errors and shuts down", async () => {
    await expect(
      withSpan("fail-span", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(mocks.activeSpan.recordException).toHaveBeenCalled();

    initTelemetry({
      serviceName: "ground-graph",
      serviceVersion: "1.0.0",
      otlpEndpoint: "http://localhost:4318",
      enabled: true,
    });
    await shutdownTelemetry();
    expect(mocks.sdkInstances.at(-1)?.shutdown).toHaveBeenCalled();
  });
});
