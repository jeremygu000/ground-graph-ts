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

export class S3ContentFetcher implements ContentFetcher {
  constructor(private keyPrefix: string = "raw") {}

  async fetch(uri: string): Promise<Buffer> {
    if (!uri.startsWith("s3://")) {
      throw new Error(`S3ContentFetcher only supports s3:// URIs, got: ${uri}`);
    }
    const key = uri.replace("s3://", "");
    const { getGlobalObjectStorageClient } = require("../object-storage/client");
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
    return fetcher;
  }
}
