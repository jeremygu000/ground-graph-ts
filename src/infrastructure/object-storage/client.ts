import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import type { ObjectStorageConfig } from "./client.types";

export class ObjectStorageClient {
  private client: S3Client;

  constructor(config: ObjectStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
    this.bucketRaw = config.bucketRaw;
    this.bucketProcessed = config.bucketProcessed;
  }

  private bucketRaw: string;
  private bucketProcessed: string;

  async upload(
    key: string,
    body: Buffer | string,
    bucket: "raw" | "processed",
    contentType?: string,
  ): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const bucketName = bucket === "raw" ? this.bucketRaw : this.bucketProcessed;
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async download(key: string, bucket: "raw" | "processed"): Promise<Buffer> {
    const bucketName = bucket === "raw" ? this.bucketRaw : this.bucketProcessed;
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async exists(key: string, bucket: "raw" | "processed"): Promise<boolean> {
    const bucketName = bucket === "raw" ? this.bucketRaw : this.bucketProcessed;
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string, bucket: "raw" | "processed"): Promise<Record<string, string>> {
    const bucketName = bucket === "raw" ? this.bucketRaw : this.bucketProcessed;
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    const metadata: Record<string, string> = {};
    if (response.ContentLength) metadata["contentLength"] = String(response.ContentLength);
    if (response.ContentType) metadata["contentType"] = response.ContentType;
    if (response.LastModified) metadata["lastModified"] = response.LastModified.toISOString();
    return metadata;
  }

  async delete(key: string, bucket: "raw" | "processed"): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const bucketName = bucket === "raw" ? this.bucketRaw : this.bucketProcessed;
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
  }

  async close(): Promise<void> {
    // S3 client doesn't need explicit close
  }
}

let globalClient: ObjectStorageClient | undefined;

export function setGlobalObjectStorageClient(client: ObjectStorageClient): void {
  globalClient = client;
}

export function getGlobalObjectStorageClient(): ObjectStorageClient {
  if (!globalClient) {
    throw new Error("Object storage client not initialized");
  }
  return globalClient;
}
