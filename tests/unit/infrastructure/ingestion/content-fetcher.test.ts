import { describe, expect, it, vi } from "vitest";
import {
  isPrivateIPv4,
  parseIPv6,
  isPrivateIPv6,
  isPrivateIp,
  UrlContentFetcher,
} from "../../../../src/infrastructure/ingestion/content-fetcher";

describe("isPrivateIPv4", () => {
  it("returns true for loopback 127.0.0.1", () => {
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateIPv4("127.0.0.0")).toBe(true);
    expect(isPrivateIPv4("127.255.255.255")).toBe(true);
  });

  it("returns true for 10.x.x.x range", () => {
    expect(isPrivateIPv4("10.0.0.0")).toBe(true);
    expect(isPrivateIPv4("10.255.255.255")).toBe(true);
    expect(isPrivateIPv4("10.1.2.3")).toBe(true);
  });

  it("returns true for 172.16.x.x to 172.31.x.x range", () => {
    expect(isPrivateIPv4("172.16.0.0")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("172.20.1.1")).toBe(true);
  });

  it("returns false for 172.15.x.x and 172.32.x.x", () => {
    expect(isPrivateIPv4("172.15.0.0")).toBe(false);
    expect(isPrivateIPv4("172.32.0.0")).toBe(false);
  });

  it("returns true for 192.168.x.x range", () => {
    expect(isPrivateIPv4("192.168.0.0")).toBe(true);
    expect(isPrivateIPv4("192.168.255.255")).toBe(true);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
  });

  it("returns true for 169.254.x.x (link-local)", () => {
    expect(isPrivateIPv4("169.254.0.0")).toBe(true);
    expect(isPrivateIPv4("169.254.255.255")).toBe(true);
  });

  it("returns true for 0.x.x.x", () => {
    expect(isPrivateIPv4("0.0.0.0")).toBe(true);
    expect(isPrivateIPv4("0.1.2.3")).toBe(true);
  });

  it("returns true for 224.x.x.x (multicast)", () => {
    expect(isPrivateIPv4("224.0.0.0")).toBe(true);
    expect(isPrivateIPv4("224.255.255.255")).toBe(true);
  });

  it("returns true for 240.x.x.x (reserved)", () => {
    expect(isPrivateIPv4("240.0.0.0")).toBe(true);
    expect(isPrivateIPv4("240.255.255.255")).toBe(true);
  });

  it("returns false for public IPs", () => {
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("1.1.1.1")).toBe(false);
    expect(isPrivateIPv4("203.0.113.1")).toBe(false);
    expect(isPrivateIPv4("172.217.14.206")).toBe(false);
  });

  it("returns false for invalid addresses", () => {
    expect(isPrivateIPv4("")).toBe(false);
    expect(isPrivateIPv4("not.an.ip")).toBe(false);
    expect(isPrivateIPv4("256.0.0.0")).toBe(false);
    expect(isPrivateIPv4("1.2.3")).toBe(false);
    expect(isPrivateIPv4("1.2.3.4.5")).toBe(false);
  });

  it("handles edge cases", () => {
    expect(isPrivateIPv4("172.16.0.0")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("192.168.0.1")).toBe(true);
  });
});

describe("parseIPv6", () => {
  it("parses full IPv6 addresses", () => {
    const result = parseIPv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    expect(result).toEqual([0x2001, 0x0db8, 0x85a3, 0, 0, 0x8a2e, 0x0370, 0x7334]);
  });

  it("parses IPv6 with :: abbreviation", () => {
    const result = parseIPv6("::1");
    expect(result).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it("parses IPv6 with trailing ::", () => {
    const result = parseIPv6("1:2:3:4:5:6:7::");
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
  });

  it("parses IPv6 with middle ::", () => {
    const result = parseIPv6("1:2:3::4:5:6:7");
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
  });

  it("parses IPv6 with leading ::", () => {
    const result = parseIPv6("::1:2:3:4:5:6:7");
    expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns null for invalid IPv6", () => {
    expect(parseIPv6("")).toBeNull();
    expect(parseIPv6("::1::2")).toBeNull();
    expect(parseIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
  });

  it("returns null for out of range groups", () => {
    expect(parseIPv6("1:2:3:4:5:6:7:gggg")).toBeNull();
  });

  it("handles case insensitivity", () => {
    const result = parseIPv6("2001:DB8:85A3:0000:0000:8A2E:0370:7334");
    expect(result).toEqual([0x2001, 0x0db8, 0x85a3, 0, 0, 0x8a2e, 0x0370, 0x7334]);
  });

  it("parses :: (all zeros)", () => {
    const result = parseIPv6("::");
    expect(result).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("handles group with leading zeros", () => {
    const result = parseIPv6("0001:0002:0003:0004:0005:0006:0007:0008");
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("isPrivateIPv6", () => {
  it("returns true for ::1 (loopback)", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
  });

  it("returns true for :: (unspecified)", () => {
    expect(isPrivateIPv6("::")).toBe(true);
  });

  it("returns true for ff00:/ multicast", () => {
    expect(isPrivateIPv6("ff00::")).toBe(true);
    expect(isPrivateIPv6("ff00::1")).toBe(true);
  });

  it("returns true for fe80:/ link-local unicast", () => {
    expect(isPrivateIPv6("fe80::")).toBe(true);
    expect(isPrivateIPv6("fe80:0000:0000:0000:0000:0000:0000:0001")).toBe(true);
  });

  it("returns true for fc00:/ unique local", () => {
    expect(isPrivateIPv6("fc00::")).toBe(true);
    expect(isPrivateIPv6("fd00::")).toBe(true);
  });

  it("returns true for IPv4-mapped IPv6", () => {
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:192.168.1.1")).toBe(true);
  });

  it("returns false for public IPv6 addresses", () => {
    expect(isPrivateIPv6("2001:db8::1")).toBe(false);
    expect(isPrivateIPv6("2606:2800:220:1::")).toBe(false);
  });

  it("handles case insensitivity", () => {
    expect(isPrivateIPv6("FE80::")).toBe(true);
    expect(isPrivateIPv6("FF00::")).toBe(true);
  });
});

describe("isPrivateIp", () => {
  it("returns true for private IPv4", () => {
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
  });

  it("returns true for private IPv6", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::")).toBe(true);
  });

  it("returns false for public IPs", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("2001:db8::1")).toBe(false);
  });

  it("handles IPv4-mapped IPv6", () => {
    expect(isPrivateIp("::ffff:192.168.1.1")).toBe(true);
  });
});

describe("UrlContentFetcher response handling", () => {
  type PrivateFetcher = {
    makeRequest: (...args: unknown[]) => Promise<unknown>;
    fetchWithPinnedIp: (url: URL) => Promise<{ body: Buffer; finalUrl: URL }>;
  };

  it("accepts successful responses and rejects oversized content-length", async () => {
    const fetcher = new UrlContentFetcher(1000, 10);
    const privateFetcher = fetcher as unknown as PrivateFetcher;
    const makeRequest = vi.spyOn(privateFetcher, "makeRequest");
    makeRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { "content-length": "3" },
      body: Buffer.from("abc"),
    });
    await expect(
      privateFetcher.fetchWithPinnedIp(new URL("http://8.8.8.8/a")),
    ).resolves.toMatchObject({ body: Buffer.from("abc") });
    makeRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { "content-length": "11" },
      body: Buffer.alloc(0),
    });
    await expect(privateFetcher.fetchWithPinnedIp(new URL("http://8.8.8.8/a"))).rejects.toThrow(
      "content-length",
    );
  });

  it("handles redirect success, missing location, and redirect errors", async () => {
    const fetcher = new UrlContentFetcher(1000, 100);
    const privateFetcher = fetcher as unknown as PrivateFetcher;
    const makeRequest = vi.spyOn(privateFetcher, "makeRequest");
    makeRequest.mockResolvedValueOnce({
      statusCode: 302,
      headers: { location: "http://8.8.8.8/final" },
      body: Buffer.alloc(0),
    });
    makeRequest.mockResolvedValueOnce({ statusCode: 200, headers: {}, body: Buffer.from("ok") });
    await expect(
      privateFetcher.fetchWithPinnedIp(new URL("http://8.8.8.8/start")),
    ).resolves.toMatchObject({ finalUrl: new URL("http://8.8.8.8/final") });
    makeRequest.mockResolvedValueOnce({ statusCode: 302, headers: {}, body: Buffer.alloc(0) });
    await expect(privateFetcher.fetchWithPinnedIp(new URL("http://8.8.8.8/start"))).rejects.toThrow(
      "redirect without Location",
    );
    makeRequest.mockResolvedValueOnce({
      statusCode: 302,
      headers: { location: "http://8.8.8.8/final" },
      body: Buffer.alloc(0),
    });
    makeRequest.mockResolvedValueOnce({ statusCode: 404, headers: {}, body: Buffer.alloc(0) });
    await expect(privateFetcher.fetchWithPinnedIp(new URL("http://8.8.8.8/start"))).rejects.toThrow(
      "404",
    );
  });
});

describe("IP parser rejection paths", () => {
  it("rejects malformed and incomplete IPv6 addresses", () => {
    expect(isPrivateIPv6("not-an-ip")).toBe(false);
    expect(isPrivateIPv6("1:2:3:4:5:6:7:8:9")).toBe(false);
    expect(parseIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
  });
});
