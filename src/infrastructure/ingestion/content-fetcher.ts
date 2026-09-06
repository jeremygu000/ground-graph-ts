import type {
  ContentFetcher,
  ContentFetcherFactory,
} from "../../application/ingestion/content-fetcher-port";
import https from "node:https";
import type http from "node:http";

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

async function resolveAndValidateHostname(hostname: string): Promise<string> {
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

  if (allAddresses.length === 0) {
    throw new Error(`UrlContentFetcher: could not resolve hostname ${hostname}`);
  }

  for (const addr of allAddresses) {
    if (isPrivateIp(addr)) {
      throw new Error(
        `UrlContentFetcher: DNS resolved to private IP ${addr} for hostname ${hostname}`,
      );
    }
  }

  const ipv4 = allAddresses.find((a) => !a.includes(":"));
  if (ipv4) return ipv4;

  const ipv6 = allAddresses.find((a) => a.includes(":"));
  if (ipv6) return ipv6;

  throw new Error(`UrlContentFetcher: no valid address for ${hostname}`);
}

async function validateResolvedIps(hostname: string): Promise<void> {
  await resolveAndValidateHostname(hostname);
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

  private async httpsRequest(
    hostname: string,
    path: string,
    validatedIp: string,
    isRedirect: boolean = false,
  ): Promise<{
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
  }> {
    const port = 443;

    return new Promise((resolve, reject) => {
      let req: http.ClientRequest;

      const timeoutId = setTimeout(() => {
        if (req) req.destroy();
        reject(new Error("UrlContentFetcher: request timeout"));
      }, this.timeoutMs);

      const options: https.RequestOptions = {
        hostname: validatedIp,
        port,
        path,
        method: "GET",
        headers: {
          Host: hostname,
          "User-Agent": "GroundGraph-Ts/1.0",
          ...(isRedirect ? { Connection: "close" } : {}),
        },
        servername: hostname,
        rejectUnauthorized: true,
      };

      req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;

        res.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > this.maxBytes) {
            req.destroy();
            clearTimeout(timeoutId);
            reject(
              new Error(
                `UrlContentFetcher: received ${totalSize} bytes exceeds max ${this.maxBytes}`,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          clearTimeout(timeoutId);
          const headers: Record<string, string | string[] | undefined> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (value !== undefined) headers[key] = value;
          }
          resolve({
            statusCode: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks),
          });
        });

        res.on("error", (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });

      req.on("error", (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      req.end();
    });
  }

  private async fetchWithPinnedIp(originalUrl: URL): Promise<{ body: Buffer; finalUrl: URL }> {
    const validatedIp = await resolveAndValidateHostname(originalUrl.hostname);

    const { statusCode, headers, body } = await this.httpsRequest(
      originalUrl.hostname,
      originalUrl.pathname + originalUrl.search,
      validatedIp,
    );

    if (statusCode >= 300 && statusCode < 400) {
      const location = headers.location;
      if (!location || typeof location !== "string") {
        throw new Error(`UrlContentFetcher: redirect without Location header from ${originalUrl}`);
      }

      const redirectUrl = new URL(location, originalUrl);
      validateUrl(redirectUrl);

      const redirectIp = await resolveAndValidateHostname(redirectUrl.hostname);
      const {
        statusCode: redirectStatus,
        headers: redirectHeaders,
        body: redirectBody,
      } = await this.httpsRequest(
        redirectUrl.hostname,
        redirectUrl.pathname + redirectUrl.search,
        redirectIp,
        true,
      );

      if (redirectStatus >= 300 && redirectStatus < 400) {
        throw new Error(
          `UrlContentFetcher: too many redirects from ${originalUrl}, final: ${redirectUrl}`,
        );
      } else if (redirectStatus >= 400) {
        throw new Error(`UrlContentFetcher failed to fetch ${originalUrl}: ${redirectStatus}`);
      }

      const contentLength = redirectHeaders["content-length"];
      if (contentLength && typeof contentLength === "string") {
        const size = parseInt(contentLength, 10);
        if (size > this.maxBytes) {
          throw new Error(
            `UrlContentFetcher: content-length ${size} exceeds max ${this.maxBytes} from ${redirectUrl}`,
          );
        }
      }

      return { body: redirectBody, finalUrl: redirectUrl };
    } else if (statusCode >= 400) {
      throw new Error(`UrlContentFetcher failed to fetch ${originalUrl}: ${statusCode}`);
    }

    const contentLength = headers["content-length"];
    if (contentLength && typeof contentLength === "string") {
      const size = parseInt(contentLength, 10);
      if (size > this.maxBytes) {
        throw new Error(
          `UrlContentFetcher: content-length ${size} exceeds max ${this.maxBytes} from ${originalUrl}`,
        );
      }
    }

    return { body, finalUrl: originalUrl };
  }

  async fetch(uri: string): Promise<Buffer> {
    if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
      throw new Error(`UrlContentFetcher only supports http/https URIs, got: ${uri}`);
    }

    const url = new URL(uri);
    validateUrl(url);
    await validateResolvedIps(url.hostname);

    const { body } = await this.fetchWithPinnedIp(url);
    return body;
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
