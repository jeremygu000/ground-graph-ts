import type { UnitOfWorkFactory } from "../../application/unit-of-work";
import type { DocumentParser, ParsedContent } from "../../application/ingestion/parser-port";
import type {
  Chunker,
  ChunkableContent,
  ChunkingOptions,
  ChunkFragment,
} from "../../application/ingestion/chunker-port";
import type { IngestionQualityReport } from "../../application/ingestion/types";
import type { Document, Source } from "../../application/ingestion/ports";
import type { ContentFetcher } from "../../application/ingestion/content-fetcher-port";
import type { ObjectStoragePort } from "../../application/ingestion/object-storage-port";
import type { TracerPort } from "../../application/observability/tracer-port";
import { computeContentHash } from "../../application/ingestion/hash";

export interface IngestionWorkflowInput {
  sourceUri: string;
  sourceType: "file" | "url" | "git" | "api" | "s3";
  mimeType?: string;
  metadata?: Record<string, unknown>;
  tenantId: string;
  principalId: string;
  userId?: string;
  chunkingStrategy?: "heading" | "recursive" | "page" | "semantic";
  maxChunkSize?: number;
  chunkOverlap?: number;
}

export interface IngestionWorkflowResult {
  documentId: string;
  versionId: string;
  versionNumber: number;
  status: "created" | "updated" | "unchanged";
  chunksCreated: number;
  qualityReport: IngestionQualityReport;
}

export class IngestionWorkflow {
  constructor(
    private uowFactory: UnitOfWorkFactory,
    private parser: DocumentParser,
    private chunker: Chunker,
    private contentFetcher: ContentFetcher,
    private tracer: TracerPort,
    private objectStorage?: ObjectStoragePort,
  ) {}

  async execute(input: IngestionWorkflowInput): Promise<IngestionWorkflowResult> {
    return await this.tracer.startActiveSpan("ingestion.workflow", async (rootSpan) => {
      try {
        return await this.uowFactory.transaction(async (uow) => {
          return await this.tracer.startActiveSpan("ingestion.transaction", async (txSpan) => {
            try {
              const source = await this.upsertSource(uow, input);
              txSpan.setAttribute("source.id", source.id);

              const parsed = await this.runParser(input, source);
              txSpan.setAttribute("document.title", parsed.title ?? "(none)");

              const { document, version, versionNumber, isNewVersion } =
                await this.upsertDocumentAndVersion(uow, input, source, parsed);
              txSpan.setAttribute("document.id", document.id);
              txSpan.setAttribute("document.version_id", version.id);

              await uow.sourceRepository.update(source.id, input.tenantId, {
                lastSyncedAt: new Date().toISOString(),
              });

              let chunksCreated = 0;
              const rawChunks: import("../../application/ingestion/chunker-port").ChunkFragment[] =
                [];
              if (isNewVersion) {
                const runChunkerResult = await this.runChunker(input, version.id, parsed);
                txSpan.setAttribute("chunk.count", runChunkerResult.length);

                await this.deactivateStaleVersions(uow, document.id, version.id, input.tenantId);

                if (runChunkerResult.length > 0) {
                  const chunksForStorage = runChunkerResult.map((c) => ({
                    ...c,
                    documentVersionId: version.id,
                    principalId: input.principalId,
                  }));
                  const chunkResult = await uow.chunkRepository.createMany(
                    chunksForStorage,
                    input.tenantId,
                  );
                  if (!chunkResult.ok) {
                    throw new Error(`Failed to create chunks: ${chunkResult.error.message}`);
                  }
                  chunksCreated = runChunkerResult.length;
                  rawChunks.push(...runChunkerResult);
                }
              }

              const qualityReport = this.generateQualityReport(
                document.id,
                version.id,
                input.sourceUri,
                rawChunks,
                input.principalId,
              );

              txSpan.setStatus("OK");
              let status: "created" | "updated" | "unchanged";
              if (versionNumber === 1) {
                status = "created";
              } else if (isNewVersion) {
                status = "updated";
              } else {
                status = "unchanged";
              }
              return {
                documentId: document.id,
                versionId: version.id,
                versionNumber,
                status,
                chunksCreated,
                qualityReport,
              };
            } catch (err) {
              txSpan.setStatus("ERROR", err instanceof Error ? err.message : String(err));
              throw err;
            } finally {
              txSpan.end();
            }
          });
        });
      } catch (err) {
        rootSpan.setStatus("ERROR", err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        rootSpan.end();
      }
    });
  }

  private async upsertSource(
    uow: Parameters<Parameters<UnitOfWorkFactory["transaction"]>[0]>[0],
    input: IngestionWorkflowInput,
  ): Promise<Source> {
    return await this.tracer.startActiveSpan("ingestion.upsertSource", async (span) => {
      try {
        span.setAttribute("source.uri", input.sourceUri);
        span.setAttribute("principal.id", input.principalId);

        const existingSource = await uow.sourceRepository.findByUri(
          input.sourceUri,
          input.tenantId,
          input.principalId,
        );

        if (existingSource.ok && existingSource.value) {
          const src = existingSource.value;
          span.setAttribute("source.id", src.id);
          span.setAttribute("source.action", "found_existing");
          return src;
        }

        span.setAttribute("source.action", "create");
        const sourceResult = await uow.sourceRepository.create(
          {
            type: input.sourceType,
            uri: input.sourceUri,
            ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
            ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          },
          input.tenantId,
          input.principalId,
        );
        if (!sourceResult.ok) {
          throw new Error(`Failed to create source: ${sourceResult.error.message}`);
        }
        span.setAttribute("source.id", sourceResult.value.id);
        return sourceResult.value;
      } finally {
        span.end();
      }
    });
  }

  private async runParser(input: IngestionWorkflowInput, source: Source): Promise<ParsedContent> {
    return await this.tracer.startActiveSpan("ingestion.parse", async (span) => {
      try {
        span.setAttribute("source.id", source.id);
        span.setAttribute("mimeType", input.mimeType ?? source.mimeType ?? "unknown");

        const content = await this.contentFetcher.fetch(input.sourceUri);
        span.setAttribute("content.size_bytes", content.byteLength);

        if (this.objectStorage) {
          const rawKey = `raw/${source.id}/${input.tenantId}/${crypto.randomUUID()}`;
          await this.objectStorage.upload(rawKey, content, "raw");
          span.setAttribute("object_storage.raw_key", rawKey);
        }

        const parsed = await this.parser.parse(content, {
          type: input.sourceType,
          uri: input.sourceUri,
          mimeType: input.mimeType,
        });

        span.setAttribute("parse.sections", parsed.sections.length);
        span.setAttribute("parse.content_length", parsed.content.length);
        return parsed;
      } finally {
        span.end();
      }
    });
  }

  private async upsertDocumentAndVersion(
    uow: Parameters<Parameters<UnitOfWorkFactory["transaction"]>[0]>[0],
    input: IngestionWorkflowInput,
    source: Source,
    parsed: ParsedContent,
  ): Promise<{
    document: Document;
    version: import("../../application/ingestion/ports").DocumentVersion;
    versionNumber: number;
    isNewVersion: boolean;
  }> {
    return await this.tracer.startActiveSpan("ingestion.upsertDocument", async (span) => {
      try {
        span.setAttribute("source.id", source.id);
        span.setAttribute("principal.id", input.principalId);

        const existingDoc = await uow.documentRepository.findBySourceId(source.id, input.tenantId);
        let document: Document;
        let versionNumber = 1;
        const newChecksum = this.computeChecksum(parsed.content);
        const newContentHash = computeContentHash(parsed.content);

        if (existingDoc.ok && existingDoc.value) {
          document = existingDoc.value;
          const latestVersion = await uow.documentVersionRepository.findLatest(
            document.id,
            input.tenantId,
          );
          if (latestVersion.ok && latestVersion.value) {
            if (latestVersion.value.checksum === newChecksum) {
              span.setAttribute("document.action", "unchanged");
              span.setStatus("OK");
              return {
                document,
                version: latestVersion.value,
                versionNumber: latestVersion.value.versionNumber,
                isNewVersion: false,
              };
            }
            versionNumber = latestVersion.value.versionNumber + 1;
            span.setAttribute("document.action", "new_version");
            span.setAttribute("document.version_number", versionNumber);
          }
        } else {
          span.setAttribute("document.action", "create");
          const docResult = await uow.documentRepository.create(
            {
              sourceId: source.id,
              principalId: input.principalId,
              ...(parsed.title !== undefined ? { title: parsed.title } : {}),
              ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
            },
            input.tenantId,
            input.principalId,
          );
          if (!docResult.ok) {
            throw new Error(`Failed to create document: ${docResult.error.message}`);
          }
          document = docResult.value;
        }

        const versionId = crypto.randomUUID();

        const versionResult = await uow.documentVersionRepository.create(document.id, {
          id: versionId,
          tenantId: input.tenantId,
          principalId: input.principalId,
          versionNumber,
          contentHash: newContentHash,
          checksum: newChecksum,
          sizeBytes: Buffer.byteLength(parsed.content, "utf-8"),
          parsedDocument: {
            sourceId: source.id,
            versionId,
            ...(parsed.title !== undefined ? { title: parsed.title } : {}),
            content: parsed.content,
            metadata: parsed.metadata,
            extractedAt: new Date().toISOString(),
          },
          isActive: true,
          ...(input.userId !== undefined ? { createdBy: input.userId } : {}),
        });

        if (!versionResult.ok) {
          throw new Error(`Failed to create document version: ${versionResult.error.message}`);
        }

        return { document, version: versionResult.value, versionNumber, isNewVersion: true };
      } finally {
        span.end();
      }
    });
  }

  private async runChunker(
    input: IngestionWorkflowInput,
    documentVersionId: string,
    parsed: ParsedContent,
  ): Promise<ChunkFragment[]> {
    return await this.tracer.startActiveSpan("ingestion.chunk", async (span) => {
      try {
        span.setAttribute("document_version.id", documentVersionId);
        span.setAttribute("chunking.strategy", input.chunkingStrategy ?? "heading");

        const chunkableContent: ChunkableContent = {
          content: parsed.content,
          ...(parsed.title !== undefined ? { title: parsed.title } : {}),
          sections: parsed.sections.map((s) => ({
            type: s.type as "heading" | "paragraph" | "code" | "table" | "list" | "other",
            content: s.content,
            ...(s.level !== undefined ? { level: s.level } : {}),
            locators: s.locators,
          })),
        };

        const options: ChunkingOptions = {
          maxChunkSize: input.maxChunkSize ?? 1000,
          overlapSize: input.chunkOverlap ?? 200,
          strategy: input.chunkingStrategy ?? "heading",
        };

        const chunks = await this.chunker.chunk(chunkableContent, options);

        span.setAttribute("chunk.count", chunks.length);
        return chunks;
      } finally {
        span.end();
      }
    });
  }

  private async deactivateStaleVersions(
    uow: Parameters<Parameters<UnitOfWorkFactory["transaction"]>[0]>[0],
    documentId: string,
    currentVersionId: string,
    tenantId: string,
  ): Promise<void> {
    return await this.tracer.startActiveSpan("ingestion.deactivateStaleVersions", async (span) => {
      const versions = await uow.documentVersionRepository.listByDocument(documentId, tenantId);
      if (!versions.ok) {
        throw versions.error;
      }
      if (versions.value.length === 0) {
        return;
      }

      const toDeactivate = versions.value.filter((v) => v.isActive && v.id !== currentVersionId);
      span.setAttribute("deactivated.count", toDeactivate.length);

      for (const version of toDeactivate) {
        const result = await uow.documentVersionRepository.deactivate(version.id, tenantId);
        if (!result.ok) {
          throw result.error;
        }
      }
    });
  }

  private computeChecksum(content: string): string {
    return computeContentHash(content);
  }

  private generateQualityReport(
    documentId: string,
    versionId: string,
    sourceUri: string,
    rawChunks: ChunkFragment[],
    principalId: string,
  ): IngestionQualityReport {
    const sizes = rawChunks.map((c) => c.content.length);
    const uniqueHashes = new Set(rawChunks.map((c) => c.contentHash));

    return {
      documentId,
      versionId,
      sourceUri,
      qualityMetrics: {
        totalChunks: rawChunks.length,
        avgChunkSize: sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0,
        minChunkSize: sizes.length > 0 ? Math.min(...sizes) : 0,
        maxChunkSize: sizes.length > 0 ? Math.max(...sizes) : 0,
        emptyChunks: rawChunks.filter((c) => c.content.trim().length === 0).length,
        duplicateChunks: rawChunks.length - uniqueHashes.size,
        parsingErrors: 0,
      },
      ingestedAt: new Date().toISOString(),
      ingestedBy: principalId,
    };
  }
}
