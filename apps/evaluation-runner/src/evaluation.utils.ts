import type { OkResult } from "./evaluation.types";

export function ok<T>(value: T): OkResult<T> {
  return { ok: true, value };
}
