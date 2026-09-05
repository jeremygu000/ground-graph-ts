import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import type { Span, Tracer } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  otlpEndpoint: string;
  enabled: boolean;
}

export function initTelemetry(config: TelemetryConfig): NodeSDK {
  if (sdk) {
    return sdk;
  }

  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: `${config.otlpEndpoint}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  if (config.enabled) {
    sdk.start();
  }

  return sdk;
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
  }
}

export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: { kind?: SpanKind; attributes?: Record<string, string> },
): Promise<T> {
  const tracer = getTracer("ground-graph");
  return await tracer.startActiveSpan(
    name,
    { kind: options?.kind ?? SpanKind.INTERNAL },
    async (span) => {
      try {
        if (options?.attributes) {
          for (const [key, value] of Object.entries(options.attributes)) {
            span.setAttribute(key, value);
          }
        }
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export function recordMetric(name: string, value: number, _unit?: string): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.setAttribute(`metric.${name}`, value);
  }
}
