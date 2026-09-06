import { describe, expect, it, vi, beforeEach } from "vitest";
import { ObjectStorageAdapter } from "../../../../src/infrastructure/object-storage/adapter";

const mockClient = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  exists: vi.fn(),
  delete: vi.fn(),
  getMetadata: vi.fn(),
}));

vi.mock("../../../../src/infrastructure/object-storage/client", () => ({
  ObjectStorageClient: class {
    upload = mockClient.upload;
    download = mockClient.download;
    exists = mockClient.exists;
    delete = mockClient.delete;
    getMetadata = mockClient.getMetadata;
  },
}));

describe("ObjectStorageAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upload", () => {
    it("calls client.upload with correct parameters", async () => {
      const adapter = new ObjectStorageAdapter(mockClient as any);
      const content = Buffer.from("test content");
      await adapter.upload("test-key", content, "raw");
      expect(mockClient.upload).toHaveBeenCalledWith("test-key", content, "raw");
    });

    it("calls client.upload for processed bucket", async () => {
      const adapter = new ObjectStorageAdapter(mockClient as any);
      const content = Buffer.from("processed content");
      await adapter.upload("processed-key", content, "processed");
      expect(mockClient.upload).toHaveBeenCalledWith("processed-key", content, "processed");
    });
  });

  describe("download", () => {
    it("calls client.download with correct parameters", async () => {
      const adapter = new ObjectStorageAdapter(mockClient as any);
      const expectedBuffer = Buffer.from("downloaded content");
      mockClient.download.mockResolvedValueOnce(expectedBuffer);

      await adapter.download("test-key", "raw");
      expect(mockClient.download).toHaveBeenCalledWith("test-key", "raw");
    });

    it("calls client.download for processed bucket", async () => {
      const adapter = new ObjectStorageAdapter(mockClient as any);
      mockClient.download.mockResolvedValueOnce(Buffer.from("processed"));

      await adapter.download("processed-key", "processed");
      expect(mockClient.download).toHaveBeenCalledWith("processed-key", "processed");
    });
  });

  describe("exists", () => {
    it("returns true when key exists", async () => {
      const adapter = new ObjectStorageAdapter(mockClient as any);
      mockClient.exists.mockResolvedValueOnce(true);

      const result = await adapter.exists("test-key", "raw");
      expect(mockClient.exists).toHaveBeenCalledWith("test-key", "raw");
      expect(result).toBe(true);
    });

    it("returns false when key does not exist", async () => {
      const adapter = new ObjectStorageAdapter(mockClient as any);
      mockClient.exists.mockResolvedValueOnce(false);

      const result = await adapter.exists("missing-key", "raw");
      expect(result).toBe(false);
    });
  });

  describe("delete", () => {
    it("calls client.delete with correct parameters", async () => {
      const adapter = new ObjectStorageAdapter(mockClient as any);
      await adapter.delete("test-key", "raw");
      expect(mockClient.delete).toHaveBeenCalledWith("test-key", "raw");
    });
  });

  describe("getMetadata", () => {
    it("returns metadata from client", async () => {
      const adapter = new ObjectStorageAdapter(mockClient as any);
      const expectedMetadata = { "content-type": "application/pdf", "content-length": "1234" };
      mockClient.getMetadata.mockResolvedValueOnce(expectedMetadata);

      const result = await adapter.getMetadata("test-key", "raw");
      expect(mockClient.getMetadata).toHaveBeenCalledWith("test-key", "raw");
      expect(result).toEqual(expectedMetadata);
    });
  });
});
