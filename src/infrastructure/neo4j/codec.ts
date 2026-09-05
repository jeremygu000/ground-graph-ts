import neo4j from "neo4j-driver";
import { JSON_OBJECT_SCHEMA, JSON_VALUE_SCHEMA, type JSONValue } from "../../domain/json";

type PlainObject = Record<string, unknown>;
type Neo4jDateTime = InstanceType<typeof neo4j.types.DateTime>;

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function encodeNeo4jDateTime(value: string): Neo4jDateTime {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO datetime value: ${value}`);
  }
  return neo4j.types.DateTime.fromStandardDate(date);
}

export function decodeNeo4jDateTime(value: unknown): string {
  if (neo4j.isDateTime(value)) {
    return value.toStandardDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  throw new Error("Invalid Neo4j value: expected DateTime");
}

function normalizeJsonValue(value: unknown, seen: WeakSet<object>): JSONValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Invalid JSON value: non-finite number");
    }
    return value;
  }

  if (neo4j.isInt(value)) {
    return neo4j.integer.toNumber(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error("Invalid JSON value: cycle detected");
    }
    seen.add(value);
    return value.map((item) => normalizeJsonValue(item, seen));
  }

  if (!isPlainObject(value)) {
    throw new Error("Invalid JSON value: unsupported type");
  }

  if (seen.has(value)) {
    throw new Error("Invalid JSON value: cycle detected");
  }
  seen.add(value);

  const normalized: PlainObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    normalized[key] = normalizeJsonValue(nestedValue, seen);
  }
  return JSON_OBJECT_SCHEMA.parse(normalized) as JSONValue;
}

export function encodeNeo4jJsonValue(value: unknown): JSONValue {
  return normalizeJsonValue(value, new WeakSet<object>());
}

export function decodeNeo4jJsonValue(value: unknown): JSONValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Invalid Neo4j JSON value: non-finite number");
    }
    return value;
  }

  if (neo4j.isInt(value)) {
    return neo4j.integer.toNumber(value);
  }

  if (neo4j.isDateTime(value)) {
    return value.toStandardDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => decodeNeo4jJsonValue(item));
  }

  if (neo4j.isNode(value) || neo4j.isRelationship(value) || neo4j.isPath(value)) {
    throw new Error("Invalid Neo4j value: graph entities are not JSON");
  }

  if (!isPlainObject(value)) {
    throw new Error("Invalid Neo4j JSON value: unsupported type");
  }

  const decoded: PlainObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    decoded[key] = decodeNeo4jJsonValue(nestedValue);
  }
  return JSON_VALUE_SCHEMA.parse(decoded) as JSONValue;
}

export function encodeNeo4jJsonProperty(value: unknown): string {
  return JSON.stringify(encodeNeo4jJsonValue(value));
}

export function decodeNeo4jJsonProperty(value: unknown): JSONValue {
  if (typeof value !== "string") {
    throw new Error("Invalid Neo4j JSON property: expected string");
  }

  return decodeNeo4jJsonValue(JSON.parse(value) as unknown);
}
