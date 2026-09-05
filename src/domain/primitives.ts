export const ISO_8601_REGEX =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/;

export function isValidIS08601DateString(value: string): boolean {
  if (!ISO_8601_REGEX.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !isNaN(date.getTime());
}

export function createUTCDateString(date: Date = new Date()): string {
  return date.toISOString();
}

export type TenantId = string & { readonly __brand: unique symbol };
export type UserId = string & { readonly __brand: unique symbol };
export type SourceId = string & { readonly __brand: unique symbol };
export type DocumentId = string & { readonly __brand: unique symbol };
export type DocumentVersionId = string & { readonly __brand: unique symbol };
export type ChunkId = string & { readonly __brand: unique symbol };
export type IndexVersionId = string & { readonly __brand: unique symbol };
export type EntityId = string & { readonly __brand: unique symbol };
export type FactId = string & { readonly __brand: unique symbol };
export type EvidenceId = string & { readonly __brand: unique symbol };
export type RunId = string & { readonly __brand: unique symbol };
export type StepId = string & { readonly __brand: unique symbol };
export type EventId = string & { readonly __brand: unique symbol };

export function createTenantId(value: string): TenantId {
  if (!value || value.length === 0) {
    throw new Error("TenantId cannot be empty");
  }
  return value as TenantId;
}

export function createUserId(value: string): UserId {
  if (!value || value.length === 0) {
    throw new Error("UserId cannot be empty");
  }
  return value as UserId;
}

export function createSourceId(value: string): SourceId {
  if (!value || value.length === 0) {
    throw new Error("SourceId cannot be empty");
  }
  return value as SourceId;
}

export function createDocumentId(value: string): DocumentId {
  if (!value || value.length === 0) {
    throw new Error("DocumentId cannot be empty");
  }
  return value as DocumentId;
}

export function createDocumentVersionId(value: string): DocumentVersionId {
  if (!value || value.length === 0) {
    throw new Error("DocumentVersionId cannot be empty");
  }
  return value as DocumentVersionId;
}

export function createChunkId(value: string): ChunkId {
  if (!value || value.length === 0) {
    throw new Error("ChunkId cannot be empty");
  }
  return value as ChunkId;
}

export function createIndexVersionId(value: string): IndexVersionId {
  if (!value || value.length === 0) {
    throw new Error("IndexVersionId cannot be empty");
  }
  return value as IndexVersionId;
}

export function createEntityId(value: string): EntityId {
  if (!value || value.length === 0) {
    throw new Error("EntityId cannot be empty");
  }
  return value as EntityId;
}

export function createFactId(value: string): FactId {
  if (!value || value.length === 0) {
    throw new Error("FactId cannot be empty");
  }
  return value as FactId;
}

export function createEvidenceId(value: string): EvidenceId {
  if (!value || value.length === 0) {
    throw new Error("EvidenceId cannot be empty");
  }
  return value as EvidenceId;
}

export function createRunId(value: string): RunId {
  if (!value || value.length === 0) {
    throw new Error("RunId cannot be empty");
  }
  return value as RunId;
}

export function createStepId(value: string): StepId {
  if (!value || value.length === 0) {
    throw new Error("StepId cannot be empty");
  }
  return value as StepId;
}

export function createEventId(value: string): EventId {
  if (!value || value.length === 0) {
    throw new Error("EventId cannot be empty");
  }
  return value as EventId;
}
