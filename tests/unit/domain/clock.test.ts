import { describe, it, expect, beforeEach } from "vitest";
import { SystemClock, setGlobalClock, getGlobalClock } from "../../../src/domain/clock";

describe("Clock", () => {
  describe("SystemClock", () => {
    let clock: SystemClock;

    beforeEach(() => {
      clock = new SystemClock();
    });

    describe("now", () => {
      it("should return a Date object", () => {
        const now = clock.now();
        expect(now).toBeInstanceOf(Date);
      });

      it("should return current time", () => {
        const before = Date.now();
        const now = clock.now().getTime();
        const after = Date.now();
        expect(now).toBeGreaterThanOrEqual(before);
        expect(now).toBeLessThanOrEqual(after);
      });
    });

    describe("nowUTC", () => {
      it("should return a UTC date", () => {
        const utc = clock.nowUTC();
        expect(utc).toBeInstanceOf(Date);
      });
    });

    describe("nowISOString", () => {
      it("should return an ISO string ending with Z", () => {
        const iso = clock.nowISOString();
        expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
      });
    });
  });

  describe("global clock", () => {
    it("should return the global clock", () => {
      const clock = getGlobalClock();
      expect(clock).toBeInstanceOf(SystemClock);
    });

    it("should allow setting a custom clock", () => {
      const customClock = new SystemClock();
      setGlobalClock(customClock);
      expect(getGlobalClock()).toBe(customClock);
    });
  });
});
