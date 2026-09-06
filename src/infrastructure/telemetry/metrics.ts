import {
  metrics,
  type Counter,
  type Histogram,
  type UpDownCounter,
  type Meter,
} from "@opentelemetry/api";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";

let meterProvider: MeterProvider | undefined;
let meter: Meter | undefined;

export interface MetricsConfig {
  serviceName: string;
  serviceVersion: string;
  otlpEndpoint: string;
  enabled: boolean;
}

export function initMetrics(config: MetricsConfig): Meter {
  if (meter) {
    return meter;
  }

  if (!config.enabled) {
    meter = metrics.getMeter(config.serviceName, config.serviceVersion);
    return meter;
  }

  const exporter = new OTLPMetricExporter({
    url: `${config.otlpEndpoint}/v1/metrics`,
  });

  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 10_000,
  });

  meterProvider = new MeterProvider({
    readers: [reader],
  });

  metrics.setGlobalMeterProvider(meterProvider);

  meter = metrics.getMeter(config.serviceName, config.serviceVersion);

  return meter;
}

export async function shutdownMetrics(): Promise<void> {
  if (meterProvider) {
    await meterProvider.shutdown();
    meterProvider = undefined;
    meter = undefined;
  }
}

export function getMeter(name?: string): Meter {
  return meter ?? metrics.getMeter(name ?? "ground-graph");
}

export { type Counter, type Histogram, type UpDownCounter };

export function createCounter(name: string, description?: string, unit?: string): Counter {
  const options: { description?: string; unit?: string } = {};
  if (description !== undefined) options.description = description;
  if (unit !== undefined) options.unit = unit;
  return getMeter().createCounter(name, options);
}

export function createHistogram(name: string, description?: string, unit?: string): Histogram {
  const options: { description?: string; unit?: string } = {};
  if (description !== undefined) options.description = description;
  if (unit !== undefined) options.unit = unit;
  return getMeter().createHistogram(name, options);
}

export function createUpDownCounter(
  name: string,
  description?: string,
  unit?: string,
): UpDownCounter {
  const options: { description?: string; unit?: string } = {};
  if (description !== undefined) options.description = description;
  if (unit !== undefined) options.unit = unit;
  return getMeter().createUpDownCounter(name, options);
}
