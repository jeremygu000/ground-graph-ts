export interface ContentFetcher {
  fetch(uri: string): Promise<Buffer>;
}

export interface ContentFetcherFactory {
  create(): ContentFetcher;
}
