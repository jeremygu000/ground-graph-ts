export interface ObjectStoragePort {
  upload(key: string, content: Buffer, bucket: "raw" | "processed"): Promise<void>;
  download(key: string, bucket: "raw" | "processed"): Promise<Buffer>;
  exists(key: string, bucket: "raw" | "processed"): Promise<boolean>;
  delete(key: string, bucket: "raw" | "processed"): Promise<void>;
  getMetadata(key: string, bucket: "raw" | "processed"): Promise<Record<string, string>>;
}
