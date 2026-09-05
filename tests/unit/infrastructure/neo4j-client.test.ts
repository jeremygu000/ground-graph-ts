import { describe, expect, it } from "vitest";
import neo4j from "neo4j-driver";
import {
  decodeNeo4jDateTime,
  encodeNeo4jDateTime,
  encodeNeo4jJsonValue,
  decodeNeo4jJsonValue,
} from "../../../src/infrastructure/neo4j/codec";

describe("Neo4j codecs", () => {
  it("round-trips nested json and datetime values", () => {
    const value = {
      alpha: "one",
      beta: [1, { gamma: true }],
      delta: { epsilon: "nested" },
    };

    expect(decodeNeo4jJsonValue(encodeNeo4jJsonValue(value))).toEqual(value);
    expect(decodeNeo4jDateTime(encodeNeo4jDateTime("2024-01-15T10:30:00.000Z"))).toBe(
      "2024-01-15T10:30:00.000Z",
    );
  });

  it("rejects unsupported integer ranges", () => {
    expect(() => decodeNeo4jJsonValue(neo4j.int("9223372036854775807"))).toThrow("safe range");
  });
});
