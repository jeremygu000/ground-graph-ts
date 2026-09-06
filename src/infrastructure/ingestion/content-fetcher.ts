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

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^224\./,
  /^240\./,
];

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "metadata.aws",
  "169.254.169.254",
  "metadata.azure.com",
];

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

function isPrivateIp(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname));
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
    return fetcher;
  }
}
