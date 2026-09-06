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

vi.mock("@opentelemetry/sdk-metrics", () => {
  class MockMeterProvider {
    shutdown = vi.fn().mockResolvedValue(undefined);
  }
  return {
    MeterProvider: MockMeterProvider,
    PeriodicExportingMetricReader: vi.fn(),
  };
});

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
import {
  shutdownMetrics,
  createCounter,
  createHistogram,
  createUpDownCounter,
  getMeter,
} from "../../../src/infrastructure/telemetry/metrics";

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

    expect(mocks.activeSpan.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: 2, message: "INTERNAL_ERROR" }),
    );

    initTelemetry({
      serviceName: "ground-graph",
      serviceVersion: "1.0.0",
      otlpEndpoint: "http://localhost:4318",
      enabled: true,
    });
    await shutdownTelemetry();
    expect(mocks.sdkInstances.at(-1)?.shutdown).toHaveBeenCalled();
  });

  it("creates metrics with and without description/unit", async () => {
    await shutdownMetrics();
    vi.clearAllMocks();

    const counter1 = createCounter("test_counter");
    const counter2 = createCounter("test_counter_with_desc", "a description");
    const counter3 = createCounter("test_counter_with_unit", undefined, "bytes");

    expect(counter1).toBeDefined();
    expect(counter2).toBeDefined();
    expect(counter3).toBeDefined();
    expect(mockMetrics.getMeter).toHaveBeenCalled();
  });

  it("creates histogram with and without description/unit", async () => {
    await shutdownMetrics();
    vi.clearAllMocks();

    const histogram1 = createHistogram("test_histogram");
    const histogram2 = createHistogram("test_histogram_with_desc", "a description");
    const histogram3 = createHistogram("test_histogram_with_unit", undefined, "ms");

    expect(histogram1).toBeDefined();
    expect(histogram2).toBeDefined();
    expect(histogram3).toBeDefined();
    expect(mockMetrics.getMeter).toHaveBeenCalled();
  });

  it("creates updown counter with and without description/unit", async () => {
    await shutdownMetrics();
    vi.clearAllMocks();

    const updown1 = createUpDownCounter("test_updown");
    const updown2 = createUpDownCounter("test_updown_with_desc", "a description");
    const updown3 = createUpDownCounter("test_updown_with_unit", undefined, "count");

    expect(updown1).toBeDefined();
    expect(updown2).toBeDefined();
    expect(updown3).toBeDefined();
    expect(mockMetrics.getMeter).toHaveBeenCalled();
  });

  it("gets meter fallback when not initialized", async () => {
    await shutdownMetrics();
    vi.clearAllMocks();

    const meter = getMeter("fallback");
    expect(meter).toBeDefined();
  });

  it("redacts URI attributes in spans", async () => {
    const span = {
      setAttribute: vi.fn(),
    };

    const { safeSetSpanAttribute } = await import("../../../src/infrastructure/telemetry/index");

    safeSetSpanAttribute(span as any, "source.uri", "https://example.com/secret/path?token=abc");
    expect(span.setAttribute).toHaveBeenCalledWith("source.uri", "https://example.com/...");

    safeSetSpanAttribute(span as any, "custom.uri", "https://other.com/api");
    expect(span.setAttribute).toHaveBeenCalledWith("custom.uri", "https://other.com/...");
  });

  it("redacts principal ID attributes in spans", async () => {
    const span = {
      setAttribute: vi.fn(),
    };

    const { safeSetSpanAttribute } = await import("../../../src/infrastructure/telemetry/index");

    safeSetSpanAttribute(span as any, "principal.id", "user-123");
    expect(span.setAttribute).toHaveBeenCalledWith("principal.id", "[redacted]");

    safeSetSpanAttribute(span as any, "custom.principalId", "user-456");
    expect(span.setAttribute).toHaveBeenCalledWith("custom.principalId", "[redacted]");

    safeSetSpanAttribute(span as any, "custom.principal_id", "user-789");
    expect(span.setAttribute).toHaveBeenCalledWith("custom.principal_id", "[redacted]");
  });

  it("redacts token/password/secret attributes in spans", async () => {
    const span = {
      setAttribute: vi.fn(),
    };

    const { safeSetSpanAttribute } = await import("../../../src/infrastructure/telemetry/index");

    safeSetSpanAttribute(span as any, "auth.token", "secret-token");
    expect(span.setAttribute).toHaveBeenCalledWith("auth.token", "[redacted]");

    safeSetSpanAttribute(span as any, "config.api_key", "key-123");
    expect(span.setAttribute).toHaveBeenCalledWith("config.api_key", "[redacted]");

    safeSetSpanAttribute(span as any, "config.password", "pass-456");
    expect(span.setAttribute).toHaveBeenCalledWith("config.password", "[redacted]");
  });

  it("passes through non-sensitive attributes", async () => {
    const span = {
      setAttribute: vi.fn(),
    };

    const { safeSetSpanAttribute } = await import("../../../src/infrastructure/telemetry/index");

    safeSetSpanAttribute(span as any, "tenant.id", "tenant-123");
    expect(span.setAttribute).toHaveBeenCalledWith("tenant.id", "tenant-123");

    safeSetSpanAttribute(span as any, "embedding.count", "42");
    expect(span.setAttribute).toHaveBeenCalledWith("embedding.count", "42");
  });

  it("handles invalid URI in redaction", async () => {
    const span = {
      setAttribute: vi.fn(),
    };

    const { safeSetSpanAttribute } = await import("../../../src/infrastructure/telemetry/index");

    safeSetSpanAttribute(span as any, "source.uri", "not-a-valid-url");
    expect(span.setAttribute).toHaveBeenCalledWith("source.uri", "[redacted]");
  });

  it("records histogram and updown metrics", async () => {
    await shutdownMetrics();
    vi.clearAllMocks();

    recordMetric("test_histogram", 100, "histogram");
    recordMetric("test_updown", 1, "updown");
    recordMetric("test_counter", 5, "counter");

    expect(mockMetrics.getMeter).toHaveBeenCalled();
  });
});
