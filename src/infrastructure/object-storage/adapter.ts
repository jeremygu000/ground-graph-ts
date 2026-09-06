import type { ObjectStoragePort } from "../../application/ingestion/object-storage-port.types";
import { ObjectStorageClient } from "./client";

export class ObjectStorageAdapter implements ObjectStoragePort {
  constructor(private client: ObjectStorageClient) {}

  async upload(key: string, content: Buffer, bucket: "raw" | "processed"): Promise<void> {
    await this.client.upload(key, content, bucket);
  }

  async download(key: string, bucket: "raw" | "processed"): Promise<Buffer> {
    return await this.client.download(key, bucket);
  }

  async exists(key: string, bucket: "raw" | "processed"): Promise<boolean> {
    return await this.client.exists(key, bucket);
  }

  async delete(key: string, bucket: "raw" | "processed"): Promise<void> {
    await this.client.delete(key, bucket);
  }

  async getMetadata(key: string, bucket: "raw" | "processed"): Promise<Record<string, string>> {
    return await this.client.getMetadata(key, bucket);
  }
}
