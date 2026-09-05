import { trace, SpanStatusCode, SpanKind, type Span as OTelSpan } from "@opentelemetry/api";
import type { Span, TracerPort } from "../../application/observability/tracer-port";

function mapStatus(code: "OK" | "ERROR"): { code: SpanStatusCode; message?: string } {
  if (code === "OK") {
    return { code: SpanStatusCode.OK };
  }
  return { code: SpanStatusCode.ERROR };
}

class OTelSpanAdapter implements Span {
  constructor(private readonly span: OTelSpan) {}

  setAttribute(key: string, value: string | number | boolean | undefined): void {
    if (value !== undefined) {
      this.span.setAttribute(key, value);
    }
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    const mapped = mapStatus(code);
    this.span.setStatus({ code: mapped.code, ...(message !== undefined ? { message } : {}) });
  }

  end(): void {
    this.span.end();
  }

  recordException(error: Error): void {
    this.span.recordException(error);
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
