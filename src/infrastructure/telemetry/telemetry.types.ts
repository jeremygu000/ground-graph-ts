export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  otlpEndpoint: string;
  enabled: boolean;
}
