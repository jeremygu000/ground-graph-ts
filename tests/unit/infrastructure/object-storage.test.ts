import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = send;
    constructor(_config: unknown) {}
  }

  class PutObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class GetObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class HeadObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class DeleteObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
  };
});

import { ObjectStorageClient } from "../../../src/infrastructure/object-storage/client";

describe("object storage client", () => {
  // reset the shared S3 send mock between cases
  afterEach(() => {
    send.mockReset();
  });

  it("uploads, downloads, checks existence, and deletes objects", async () => {
    send.mockImplementation(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "GetObjectCommand") {
        return { Body: Readable.from([Buffer.from("hello")]) };
      }
      if (command.constructor.name === "HeadObjectCommand") {
        return {
          ContentLength: 5,
          ContentType: "text/plain",
          LastModified: new Date("2024-01-15T10:30:00.000Z"),
        };
      }
      return {};
    });

    const client = new ObjectStorageClient({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucketRaw: "raw-bucket",
      bucketProcessed: "processed-bucket",
    });

    await expect(client.upload("object", "body", "raw", "text/plain")).resolves.toBeUndefined();
    await expect(client.download("object", "raw")).resolves.toEqual(Buffer.from("hello"));
    await expect(client.exists("object", "raw")).resolves.toBe(true);
    await expect(client.getMetadata("object", "raw")).resolves.toEqual({
      contentLength: "5",
      contentType: "text/plain",
      lastModified: "2024-01-15T10:30:00.000Z",
    });
    await expect(client.delete("object", "processed")).resolves.toBeUndefined();
    expect(send).toHaveBeenCalled();
  });

  it("handles processed bucket lookups and errors", async () => {
    send.mockImplementation(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "GetObjectCommand") {
        return { Body: Readable.from([Buffer.from("processed")]) };
      }
      if (command.constructor.name === "HeadObjectCommand") {
        return {};
      }
      return {};
    });

    const client = new ObjectStorageClient({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucketRaw: "raw-bucket",
      bucketProcessed: "processed-bucket",
    });

    await expect(client.upload("object", "body", "processed")).resolves.toBeUndefined();
    await expect(client.download("object", "processed")).resolves.toEqual(Buffer.from("processed"));
    await expect(client.getMetadata("object", "processed")).resolves.toEqual({});

    send.mockRejectedValueOnce(new Error("missing"));
    await expect(client.exists("missing", "processed")).resolves.toBe(false);
  });
});
