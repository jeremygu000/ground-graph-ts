import { trace, SpanStatusCode, SpanKind, type Span as OTelSpan } from "@opentelemetry/api";
import type { Span, TracerPort } from "../../application/observability/tracer-port.types";

function mapStatus(code: "OK" | "ERROR"): { code: SpanStatusCode } {
  if (code === "OK") {
    return { code: SpanStatusCode.OK };
  }
  return { code: SpanStatusCode.ERROR };
}

function safeSetAttribute(
  span: OTelSpan,
  key: string,
  value: string | number | boolean | undefined,
): void {
  if (value === undefined) return;

  if (key === "source.uri" || key.endsWith(".uri")) {
    if (typeof value === "string") {
      try {
        const url = new URL(value);
        span.setAttribute(key, `${url.protocol}//${url.host}/...`);
      } catch {
        span.setAttribute(key, "[redacted]");
      }
    } else {
      span.setAttribute(key, "[redacted]");
    }
  } else if (
    key === "principal.id" ||
    key.endsWith(".principalId") ||
    key.endsWith(".principal_id")
  ) {
    span.setAttribute(key, "[redacted]");
  } else if (
    key.includes("token") ||
    key.includes("secret") ||
    key.includes("key") ||
    key.includes("password")
  ) {
    span.setAttribute(key, "[redacted]");
  } else {
    span.setAttribute(key, value);
  }
}

class OTelSpanAdapter implements Span {
  constructor(private readonly span: OTelSpan) {}

  setAttribute(key: string, value: string | number | boolean | undefined): void {
    safeSetAttribute(this.span, key, value);
  }

  setStatus(code: "OK" | "ERROR", _message?: string): void {
    const mapped = mapStatus(code);
    if (mapped.code === SpanStatusCode.ERROR) {
      this.span.setStatus({ code: mapped.code, message: "[error]" });
    } else {
      this.span.setStatus(mapped);
    }
  }

  end(): void {
    this.span.end();
  }

  recordException(_error: Error): void {
    // Intentionally empty - raw exceptions should not be recorded per telemetry privacy policy
  }
}

export class OpenTelemetryTracer implements TracerPort {
  private readonly tracer = trace.getTracer("ingestion-workflow", "1.0.0");

  async startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
    return await this.tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL }, async (span) => {
      const adapter = new OTelSpanAdapter(span);
      try {
        return await fn(adapter);
      } finally {
        span.end();
      }
    });
  }

  startSpan(name: string): Span {
    const span = this.tracer.startSpan(name, { kind: SpanKind.INTERNAL });
    return new OTelSpanAdapter(span);
  }
}
