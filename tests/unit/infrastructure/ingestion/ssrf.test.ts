import { describe, expect, it } from "vitest";
import {
  isPrivateIPv4,
  parseIPv6,
  isPrivateIPv6,
  isPrivateIp,
} from "../../../../src/infrastructure/ingestion/content-fetcher";

describe("isPrivateIPv4", () => {
  describe("returns true for private ranges", () => {
    it("returns true for loopback (127.x.x.x)", () => {
      expect(isPrivateIPv4("127.0.0.1")).toBe(true);
      expect(isPrivateIPv4("127.255.255.255")).toBe(true);
      expect(isPrivateIPv4("127.0.0.0")).toBe(true);
    });

    it("returns true for 10.x.x.x (Class A)", () => {
      expect(isPrivateIPv4("10.0.0.0")).toBe(true);
      expect(isPrivateIPv4("10.255.255.255")).toBe(true);
      expect(isPrivateIPv4("10.0.0.1")).toBe(true);
    });

    it("returns true for 172.16.x.x - 172.31.x.x (Class B)", () => {
      expect(isPrivateIPv4("172.16.0.0")).toBe(true);
      expect(isPrivateIPv4("172.16.255.255")).toBe(true);
      expect(isPrivateIPv4("172.31.255.255")).toBe(true);
      expect(isPrivateIPv4("172.20.0.1")).toBe(true);
    });

    it("returns true for 192.168.x.x (Class C)", () => {
      expect(isPrivateIPv4("192.168.0.0")).toBe(true);
      expect(isPrivateIPv4("192.168.255.255")).toBe(true);
      expect(isPrivateIPv4("192.168.1.1")).toBe(true);
    });

    it("returns true for 169.254.x.x (link-local)", () => {
      expect(isPrivateIPv4("169.254.0.0")).toBe(true);
      expect(isPrivateIPv4("169.254.255.255")).toBe(true);
      expect(isPrivateIPv4("169.254.169.254")).toBe(true);
    });

    it("returns true for 0.x.x.x", () => {
      expect(isPrivateIPv4("0.0.0.0")).toBe(true);
    });

    it("returns true for 224.x.x.x (multicast)", () => {
      expect(isPrivateIPv4("224.0.0.0")).toBe(true);
      expect(isPrivateIPv4("224.255.255.255")).toBe(true);
    });

    it("returns true for 240.x.x.x (reserved)", () => {
      expect(isPrivateIPv4("240.0.0.0")).toBe(true);
    });
  });

  describe("returns false for public addresses", () => {
    it("returns false for 8.8.8.8 (Google DNS)", () => {
      expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    });

    it("returns false for 1.1.1.1 (Cloudflare)", () => {
      expect(isPrivateIPv4("1.1.1.1")).toBe(false);
    });

    it("returns false for 9.9.9.9 (Quad9)", () => {
      expect(isPrivateIPv4("9.9.9.9")).toBe(false);
    });

    it("returns false for AWS ranges", () => {
      expect(isPrivateIPv4("52.94.236.0")).toBe(false);
      expect(isPrivateIPv4("54.239.28.0")).toBe(false);
    });

    it("returns false for Azure ranges", () => {
      expect(isPrivateIPv4("13.64.0.0")).toBe(false);
      expect(isPrivateIPv4("20.0.0.0")).toBe(false);
    });

    it("returns false for addresses just outside private ranges", () => {
      expect(isPrivateIPv4("11.0.0.0")).toBe(false);
      expect(isPrivateIPv4("172.15.0.0")).toBe(false);
      expect(isPrivateIPv4("172.32.0.0")).toBe(false);
      expect(isPrivateIPv4("192.169.0.0")).toBe(false);
    });
  });

  describe("handles invalid input", () => {
    it("returns false for invalid address formats", () => {
      expect(isPrivateIPv4("")).toBe(false);
      expect(isPrivateIPv4("abc")).toBe(false);
      expect(isPrivateIPv4("256.256.256.256")).toBe(false);
    });

    it("returns false for partial addresses", () => {
      expect(isPrivateIPv4("127.0")).toBe(false);
      expect(isPrivateIPv4("10")).toBe(false);
    });

    it("returns false for addresses with extra parts", () => {
      expect(isPrivateIPv4("127.0.0.1.1")).toBe(false);
    });
  });
});

describe("parseIPv6", () => {
  describe("parses valid IPv6 addresses", () => {
    it("parses full IPv6 addresses", () => {
      const result = parseIPv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(8);
      expect(result![0]).toBe(0x2001);
      expect(result![7]).toBe(0x7334);
    });

    it("parses unspecified address", () => {
      const result = parseIPv6("::");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(8);
      expect(result!.every((g) => g === 0)).toBe(true);
    });

    it("parses unspecified address", () => {
      const result = parseIPv6("::");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(8);
      expect(result!.every((g) => g === 0)).toBe(true);
    });

    it("parses IPv4-mapped IPv6 addresses", () => {
      const result = parseIPv6("::ffff:192.168.1.1");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(8);
    });

    it("parses addresses with :: in the middle", () => {
      const result = parseIPv6("2001:db8::8a2e:370:7334");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(8);
    });

    it("parses lowercase hex", () => {
      const result = parseIPv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
      const resultLower = parseIPv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334".toLowerCase());
      expect(result).toEqual(resultLower);
    });
  });

  describe("returns null for invalid input", () => {
    it("returns null for invalid hex groups", () => {
      expect(parseIPv6("2001:db8:85a3:gggg:0000:8a2e:0370:7334")).toBeNull();
    });

    it("returns null for out of range values", () => {
      expect(parseIPv6("2001:db8:85a3:ffff:0000:8a2e:0370:10000")).toBeNull();
    });

    it("returns null for too many groups", () => {
      expect(parseIPv6("2001:db8:85a3:0000:0000:8a2e:0370:7334:1234")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseIPv6("")).toBeNull();
    });
  });
});

describe("isPrivateIPv6", () => {
  describe("returns true for private/uniquelocal addresses", () => {
    it("returns true for loopback", () => {
      expect(isPrivateIPv6("::1")).toBe(true);
    });

    it("returns true for unspecified", () => {
      expect(isPrivateIPv6("::")).toBe(true);
    });

    it("returns true for ff00: (multicast range start)", () => {
      expect(isPrivateIPv6("ff00::")).toBe(true);
    });

    it("returns true for fe80: (link-local)", () => {
      expect(isPrivateIPv6("fe80::")).toBe(true);
      expect(isPrivateIPv6("fe80::1")).toBe(true);
      expect(isPrivateIPv6("fe80:0000:0000:0000:0000:0000:0000:1234")).toBe(true);
    });

    it("returns true for fc00: and fd00: (unique local)", () => {
      expect(isPrivateIPv6("fc00::")).toBe(true);
      expect(isPrivateIPv6("fd00::")).toBe(true);
      expect(isPrivateIPv6("fc00:0000:0000:0000:0000:0000:0000:0001")).toBe(true);
    });

    it("returns true for IPv4-mapped private addresses", () => {
      expect(isPrivateIPv6("::ffff:10.0.0.1")).toBe(true);
      expect(isPrivateIPv6("::ffff:192.168.1.1")).toBe(true);
      expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
    });
  });

  describe("returns false for public addresses", () => {
    it("returns false for global unicast starting with 2000:", () => {
      expect(isPrivateIPv6("2001:db8::")).toBe(false);
      expect(isPrivateIPv6("2001:4860:4860::8888")).toBe(false);
    });

    it("returns false for 6to4 addresses (2002:)", () => {
      expect(isPrivateIPv6("2002:0000:0000:0000:0000:0000:0000:0001")).toBe(false);
    });

    it("returns false for Teredo (2001:0000:)", () => {
      expect(isPrivateIPv6("2001:0000:0000:0000:0000:0000:0000:0001")).toBe(false);
    });
  });

  describe("handles invalid input", () => {
    it("returns false for invalid addresses", () => {
      expect(isPrivateIPv6("")).toBe(false);
      expect(isPrivateIPv6("invalid")).toBe(false);
    });
  });
});

describe("isPrivateIp", () => {
  describe("detects private IPv4 addresses", () => {
    it("detects private ranges", () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true);
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("192.168.1.1")).toBe(true);
      expect(isPrivateIp("127.0.0.1")).toBe(true);
    });

    it("detects public IPv4 addresses", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false);
      expect(isPrivateIp("1.1.1.1")).toBe(false);
    });
  });

  describe("detects private IPv6 addresses", () => {
    it("detects IPv6 private ranges", () => {
      expect(isPrivateIp("::1")).toBe(true);
      expect(isPrivateIp("fe80::1")).toBe(true);
      expect(isPrivateIp("fc00::")).toBe(true);
    });

    it("detects public IPv6 addresses", () => {
      expect(isPrivateIp("2001:db8::")).toBe(false);
      expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
    });
  });
});
