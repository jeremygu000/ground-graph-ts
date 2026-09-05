import neo4j from "neo4j-driver";
import { describe, expect, it } from "vitest";
import {
  decodeNeo4jDateTime,
  decodeNeo4jJsonProperty,
  decodeNeo4jJsonValue,
  encodeNeo4jDateTime,
  encodeNeo4jJsonProperty,
  encodeNeo4jJsonValue,
} from "../../../src/infrastructure/neo4j";

describe("neo4j codec", () => {
  it("round-trips JSON properties as strings", () => {
    const payload = {
      nested: {
        ok: true,
        values: [1, "two", { three: 3 }],
      },
    };

    const encoded = encodeNeo4jJsonProperty(payload);
    expect(typeof encoded).toBe("string");
    expect(decodeNeo4jJsonProperty(encoded)).toEqual(payload);
  });

  it("rejects integers outside the JavaScript safe range", () => {
    const unsafe = neo4j.int("9223372036854775807");

    expect(() => encodeNeo4jJsonValue(unsafe)).toThrow("safe range");
    expect(() => decodeNeo4jJsonValue(unsafe)).toThrow("safe range");
  });

  it("round-trips datetime values", () => {
    const encoded = encodeNeo4jDateTime("2024-01-15T10:30:00.000Z");
    expect(decodeNeo4jDateTime(encoded)).toBe("2024-01-15T10:30:00.000Z");
  });
});
