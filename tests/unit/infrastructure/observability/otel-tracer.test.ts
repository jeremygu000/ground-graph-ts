import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";

const mockSpan = vi.hoisted(() => ({
  setAttribute: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
}));

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: vi.fn(() => ({
      startActiveSpan: vi.fn(),
      startSpan: vi.fn(() => mockSpan),
    })),
  },
  SpanStatusCode: {
    OK: 0,
    ERROR: 2,
  },
  SpanKind: {
    INTERNAL: 0,
  },
}));

import { OpenTelemetryTracer } from "../../../../src/infrastructure/observability/otel-tracer";

describe("OpenTelemetryTracer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates tracer with correct name", async () => {
    const tracer = new OpenTelemetryTracer();
    expect(tracer).toBeDefined();
  });

  it("startSpan returns a span adapter", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test-span");
    expect(span).toBeDefined();
    expect(typeof span.setAttribute).toBe("function");
    expect(typeof span.setStatus).toBe("function");
    expect(typeof span.end).toBe("function");
  });
});

describe("OTelSpanAdapter.setAttribute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets string attributes normally when not sensitive", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("custom.name", "John");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("custom.name", "John");
  });

  it("sets numeric attributes normally", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("count", 42);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("count", 42);
  });

  it("sets boolean attributes normally", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("enabled", true);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("enabled", true);
  });

  it("skips undefined values", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("missing", undefined);
    expect(mockSpan.setAttribute).not.toHaveBeenCalled();
  });

  it("redacts source.uri to show only protocol and host", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("source.uri", "https://example.com/path?token=abc");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("source.uri", "https://example.com/...");
  });

  it("redacts URIs ending with .uri to show protocol and host", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("document.uri", "https://secure.example.com/file.pdf");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      "document.uri",
      "https://secure.example.com/...",
    );
  });

  it("redacts principal.id", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("principal.id", "user-123");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("principal.id", "[redacted]");
  });

  it("redacts keys ending with .principalId", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("request.principalId", "user-456");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("request.principalId", "[redacted]");
  });

  it("redacts keys ending with .principal_id", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("session.principal_id", "user-789");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("session.principal_id", "[redacted]");
  });

  it("redacts keys containing token", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("auth.token", "secret-token");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("auth.token", "[redacted]");
  });

  it("redacts keys containing secret", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("api.secret", "my-secret-key");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("api.secret", "[redacted]");
  });

  it("redacts keys containing key (like api.key)", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("api.key", "AKIAIOSFODNN7EXAMPLE");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("api.key", "[redacted]");
  });

  it("redacts keys containing password", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("db.password", "super-secret");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("db.password", "[redacted]");
  });

  it("redacts invalid URIs as [redacted]", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("source.uri", "not-a-valid-uri");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("source.uri", "[redacted]");
  });

  it("redacts non-string URI values", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setAttribute("source.uri", 123 as any);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("source.uri", "[redacted]");
  });
});

describe("OTelSpanAdapter.setStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets OK status", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setStatus("OK");
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
  });

  it("sets ERROR status with message", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.setStatus("ERROR", "Something went wrong");
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: "[error]",
    });
  });
});

describe("OTelSpanAdapter.end", () => {
  it("calls span.end()", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.end();
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });
});

describe("OTelSpanAdapter.recordException", () => {
  it("does not record exception (privacy policy)", () => {
    const tracer = new OpenTelemetryTracer();
    const span = tracer.startSpan("test");
    span.recordException(new Error("test error"));
    expect(mockSpan.setAttribute).not.toHaveBeenCalled();
  });
});
