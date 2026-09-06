import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import type { Span, Tracer } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { createCounter, createHistogram, createUpDownCounter } from "./metrics";

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
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

const metricCounters = new Map<string, ReturnType<typeof createCounter>>();
const metricHistograms = new Map<string, ReturnType<typeof createHistogram>>();
const metricUpDownCounters = new Map<string, ReturnType<typeof createUpDownCounter>>();

export function recordMetric(name: string, value: number, type: "counter" | "histogram" | "updown" = "counter"): void {
  if (type === "counter") {
    let counter = metricCounters.get(name);
    if (!counter) {
      counter = createCounter(name);
      metricCounters.set(name, counter);
    }
    counter.add(value);
  } else if (type === "histogram") {
    let histogram = metricHistograms.get(name);
    if (!histogram) {
      histogram = createHistogram(name);
      metricHistograms.set(name, histogram);
    }
    histogram.record(value);
  } else {
    let updown = metricUpDownCounters.get(name);
    if (!updown) {
      updown = createUpDownCounter(name);
      metricUpDownCounters.set(name, updown);
    }
    updown.add(value);
  }
}
