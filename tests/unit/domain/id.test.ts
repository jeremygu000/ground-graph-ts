import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UUIDv7Generator,
  getGlobalIdGenerator,
  setGlobalIdGenerator,
} from "../../../src/domain/id";

describe("domain id", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setGlobalIdGenerator(new UUIDv7Generator());
  });

  it("generates stable prefixed IDs", () => {
    vi.spyOn(Date, "now").mockReturnValue(1705314600000);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const generator = new UUIDv7Generator();
    const id = generator.generate("evt");
    const second = generator.generate("evt");

    expect(id.startsWith("12")).toBe(true);
    expect(id).toHaveLength(28);
    expect(second.startsWith("12")).toBe(true);
    expect(second).not.toBe(id);
  });

  it("allows swapping the global generator", () => {
    const custom = { generate: () => "custom-id" };
    setGlobalIdGenerator(custom);

    expect(getGlobalIdGenerator()).toBe(custom);
  });
});
