import type {
  ContentFetcher,
  ContentFetcherFactory,
} from "../../application/ingestion/content-fetcher-port";

export class FileContentFetcher implements ContentFetcher {
  async fetch(uri: string): Promise<Buffer> {
    if (!uri.startsWith("file://")) {
      throw new Error(`FileContentFetcher only supports file:// URIs, got: ${uri}`);
    }
    const path = uri.replace("file://", "");
    const fs = await import("fs/promises");
    return fs.readFile(path);
  }
}

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "metadata.aws",
  "169.254.169.254",
  "metadata.azure.com",
];

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split(".").map(Number);
  if (parts.length !== 4) return false;
  const a = parts[0]!;
  const b = parts[1]!;

  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a === 224) return true;
  if (a === 240) return true;
  return false;
}

function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::1") return true;
  if (lower === "fc00::" || lower.startsWith("fc")) return true;
  if (lower === "fd00::" || lower.startsWith("fd")) return true;
  if (lower === "fe80::" || lower.startsWith("fe80")) return true;
  if (lower === "ff00::" || lower.startsWith("ff")) return true;
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice(7);
    if (isPrivateIPv4(mapped)) return true;
  }
  return false;
}

function isPrivateIp(addr: string): boolean {
  return isPrivateIPv4(addr) || isPrivateIPv6(addr);
}

async function validateResolvedIps(hostname: string): Promise<void> {
  const dns = await import("node:dns");
  const { promisify } = await import("util");

  const resolve4 = promisify(dns.resolve4);
  const resolve6 = promisify(dns.resolve6);
  const lookup = promisify(dns.lookup);

  const allAddresses: string[] = [];

  try {
    const v4 = await resolve4(hostname);
    if (v4) allAddresses.push(...v4);
  } catch {
    // ignore
  }

  try {
    const v6 = await resolve6(hostname);
    if (v6) allAddresses.push(...v6);
  } catch {
    // ignore
  }

  if (allAddresses.length === 0) {
    const result = await lookup(hostname);
    if (result) allAddresses.push(result.address);
  }

  for (const addr of allAddresses) {
    if (isPrivateIp(addr)) {
      throw new Error(
        `UrlContentFetcher: DNS resolved to private IP ${addr} for hostname ${hostname}`,
      );
    }
  }
}

function validateUrl(url: URL): void {
  if (url.username || url.password) {
    throw new Error(`UrlContentFetcher: URL credentials are not allowed: ${url}`);
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new Error(`UrlContentFetcher: blocked hostname: ${hostname}`);
  }

  if (isPrivateIp(hostname)) {
    throw new Error(`UrlContentFetcher: private IP addresses are not allowed: ${hostname}`);
  }
}

export class UrlContentFetcher implements ContentFetcher {
  constructor(
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
    private maxBytes: number = DEFAULT_MAX_BYTES,
  ) {}

  async fetch(uri: string): Promise<Buffer> {
    if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
      throw new Error(`UrlContentFetcher only supports http/https URIs, got: ${uri}`);
    }

    const url = new URL(uri);
    validateUrl(url);
    await validateResolvedIps(url.hostname);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    let finalUrl = url;

    try {
      response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        const locationHeader = response.headers.get("location");
        if (!locationHeader) {
          throw new Error(`UrlContentFetcher: redirect without Location header from ${uri}`);
        }

        const redirectUrl = new URL(locationHeader, url);
        validateUrl(redirectUrl);
        await validateResolvedIps(redirectUrl.hostname);
        finalUrl = redirectUrl;

        clearTimeout(timeoutId);
        const redirectTimeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          response = await fetch(redirectUrl, {
            signal: controller.signal,
            redirect: "manual",
          });

          if (response.status >= 300 && response.status < 400) {
            throw new Error(
              `UrlContentFetcher: too many redirects from ${uri}, final: ${redirectUrl}`,
            );
          }
        } finally {
          clearTimeout(redirectTimeoutId);
        }
      } else if (response.status >= 300) {
        throw new Error(
          `UrlContentFetcher failed to fetch ${uri}: ${response.status} ${response.statusText}`,
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > this.maxBytes) {
        throw new Error(
          `UrlContentFetcher: content-length ${size} exceeds max ${this.maxBytes} bytes from ${finalUrl}`,
        );
      }
    }

    const chunks: Uint8Array[] = [];
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error(`UrlContentFetcher: no response body from ${finalUrl}`);
    }

    let totalSize = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.byteLength;
        if (totalSize > this.maxBytes) {
          throw new Error(
            `UrlContentFetcher: received ${totalSize} bytes exceeds max ${this.maxBytes} from ${finalUrl}`,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const result = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return result;
  }
}

export class S3ContentFetcher implements ContentFetcher {
  constructor(private keyPrefix: "raw" | "processed" = "raw") {}

  async fetch(uri: string): Promise<Buffer> {
    if (!uri.startsWith("s3://")) {
      throw new Error(`S3ContentFetcher only supports s3:// URIs, got: ${uri}`);
    }
    const key = uri.replace("s3://", "");
    const { getGlobalObjectStorageClient } = await import("../object-storage/client");
    const client = getGlobalObjectStorageClient();
    return client.download(key, this.keyPrefix);
  }
}

export class CompositeContentFetcher implements ContentFetcher {
  private fetchers: Map<string, ContentFetcher> = new Map();

  register(scheme: string, fetcher: ContentFetcher): void {
    this.fetchers.set(scheme, fetcher);
  }

  async fetch(uri: string): Promise<Buffer> {
    const parts = uri.split("://");
    const scheme = parts[0] ?? "";
    const fetcher = this.fetchers.get(scheme);
    if (!fetcher) {
      throw new Error(`No ContentFetcher registered for scheme: ${scheme}`);
    }
    return fetcher.fetch(uri);
  }
}

export class DefaultContentFetcherFactory implements ContentFetcherFactory {
  create(): ContentFetcher {
    const fetcher = new CompositeContentFetcher();
    fetcher.register("file", new FileContentFetcher());
    fetcher.register("http", new UrlContentFetcher());
    fetcher.register("https", new UrlContentFetcher());
    fetcher.register("s3", new S3ContentFetcher("raw"));
    return fetcher;
  }
}
