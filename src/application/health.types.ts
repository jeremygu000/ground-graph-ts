export interface HealthChecker {
  name: string;
  check(): Promise<HealthResult>;
}

export interface HealthResult {
  healthy: boolean;
  message?: string;
  latencyMs?: number;
  error?: string;
}

export interface SystemHealth {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  checks: Record<string, HealthResult>;
  overallLatencyMs?: number;
}
