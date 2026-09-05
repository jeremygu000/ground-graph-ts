export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface Span {
  setAttribute(key: string, value: string | number | boolean | undefined): void;
  setStatus(code: "OK" | "ERROR", message?: string): void;
  end(): void;
  recordException(error: Error): void;
}

export interface TracerPort {
  startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
  startSpan(name: string): Span;
}
