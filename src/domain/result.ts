export type Result<T, E = Error> = SuccessResult<T> | FailureResult<E>;

export interface SuccessResult<T> {
  readonly ok: true;
  readonly value: T;
}

export interface FailureResult<E> {
  readonly ok: false;
  readonly error: E;
}

export function success<T>(value: T): SuccessResult<T> {
  return { ok: true, value } as const;
}

export function failure<E>(error: E): FailureResult<E> {
  return { ok: false, error } as const;
}

export function isSuccess<T, E>(result: Result<T, E>): result is SuccessResult<T> {
  return result.ok === true;
}

export function isFailure<T, E>(result: Result<T, E>): result is FailureResult<E> {
  return result.ok === false;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (isFailure(result)) {
    throw result.error;
  }
  return result.value;
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isFailure(result)) {
    return defaultValue;
  }
  return result.value;
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (isSuccess(result)) {
    return success(fn(result.value));
  }
  return failure(result.error);
}

export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isSuccess(result)) {
    return success(result.value);
  }
  return failure(fn(result.error));
}

export async function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Promise<Result<U, E>> {
  if (isSuccess(result)) {
    return fn(result.value);
  }
  return failure(result.error);
}

export async function andThenAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>,
): Promise<Result<U, E>> {
  if (isSuccess(result)) {
    return fn(result.value);
  }
  return failure(result.error);
}
