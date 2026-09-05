import type { UnitOfWorkFactory } from "../../application/unit-of-work";
import type { DocumentParser, ParsedContent } from "../../application/ingestion/parser-port";
import type {
  Chunker,
  ChunkableContent,
  ChunkingOptions,
} from "../../application/ingestion/chunker-port";
import type { IngestionQualityReport } from "../../application/ingestion/types";
import type { Document, Source } from "../../application/ingestion/ports";
import type { ContentFetcher } from "../../application/ingestion/content-fetcher-port";
import type { Chunk } from "../../application/ingestion/ports";
import { computeContentHash } from "../../application/ingestion/hash";

export interface IngestionWorkflowInput {
  sourceUri: string;
  sourceType: "file" | "url" | "git" | "api";
  mimeType?: string;
  metadata?: Record<string, unknown>;
  tenantId: string;
  userId?: string;
  chunkingStrategy?: "heading" | "recursive" | "page" | "semantic";
  maxChunkSize?: number;
  chunkOverlap?: number;
}

export interface IngestionWorkflowResult {
  documentId: string;
  versionId: string;
  versionNumber: number;
  status: "created" | "unchanged";
  chunksCreated: number;
  qualityReport: IngestionQualityReport;
}

export class IngestionWorkflow {
  constructor(
    private uowFactory: UnitOfWorkFactory,
    private parser: DocumentParser,
    private chunker: Chunker,
    private contentFetcher: ContentFetcher,
  ) {}

  async execute(input: IngestionWorkflowInput): Promise<IngestionWorkflowResult> {
    return await this.uowFactory.transaction(async (uow) => {
      const existingSource = await uow.sourceRepository.findByUri(input.sourceUri, input.tenantId);
      let source: Source;

      if (existingSource.ok && existingSource.value) {
        source = existingSource.value;
      } else {
        const sourceResult = await uow.sourceRepository.create(
          {
            type: input.sourceType,
            uri: input.sourceUri,
            ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
            ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          },
          input.tenantId,
        );
        if (!sourceResult.ok) {
          throw new Error(`Failed to create source: ${sourceResult.error.message}`);
        }
        source = sourceResult.value;
      }

      const content = await this.contentFetcher.fetch(input.sourceUri);

      const parsed = await this.parser.parse(content, {
        type: input.sourceType,
        uri: input.sourceUri,
        mimeType: input.mimeType,
      });

      const existingDoc = await uow.documentRepository.findBySourceId(source.id, input.tenantId);
      let document: Document;
      let versionNumber = 1;
      const newChecksum = this.computeChecksum(parsed.content);
      const newContentHash = this.hashContent(parsed.content);

      if (existingDoc.ok && existingDoc.value) {
        document = existingDoc.value;
        const latestVersion = await uow.documentVersionRepository.findLatest(
          document.id,
          input.tenantId,
        );
        if (latestVersion.ok && latestVersion.value) {
          // Idempotency: if content hasn't changed, return existing version
          if (latestVersion.value.checksum === newChecksum) {
            return {
              documentId: document.id,
              versionId: latestVersion.value.id,
              versionNumber: latestVersion.value.versionNumber,
              status: "unchanged" as const,
              chunksCreated: 0,
              qualityReport: {
                documentId: document.id,
                versionId: latestVersion.value.id,
                sourceUri: input.sourceUri,
                qualityMetrics: {
                  totalChunks: 0,
                  avgChunkSize: 0,
                  minChunkSize: 0,
                  maxChunkSize: 0,
                  emptyChunks: 0,
                  duplicateChunks: 0,
                  parsingErrors: 0,
                },
                ingestedAt: new Date().toISOString(),
                ingestedBy: input.userId ?? "system",
              },
            };
          }
          versionNumber = latestVersion.value.versionNumber + 1;
        }
      } else {
        const docResult = await uow.documentRepository.create(
          {
            sourceId: source.id,
            ...(parsed.title !== undefined ? { title: parsed.title } : {}),
            ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          },
          input.tenantId,
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

      const version = versionResult.value;

      const chunks = await this.createChunks(parsed, version.id, {
        maxChunkSize: input.maxChunkSize ?? 1000,
        overlapSize: input.chunkOverlap ?? 200,
        strategy: input.chunkingStrategy ?? "heading",
      });

      if (chunks.length > 0) {
        const chunkResult = await uow.chunkRepository.createMany(chunks, input.tenantId);
        if (!chunkResult.ok) {
          throw new Error(`Failed to create chunks: ${chunkResult.error.message}`);
        }
      }

      const qualityReport = this.generateQualityReport(
        document.id,
        version.id,
        input.sourceUri,
        chunks,
      );

      return {
        documentId: document.id,
        versionId: version.id,
        versionNumber: version.versionNumber,
        status: "created" as const,
        chunksCreated: chunks.length,
        qualityReport,
      };
    });
  }

  private async createChunks(
    parsed: ParsedContent,
    documentVersionId: string,
    options: ChunkingOptions,
  ): Promise<Chunk[]> {
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

    const chunks = await this.chunker.chunk(chunkableContent, options);

    for (const chunk of chunks) {
      chunk.documentVersionId = documentVersionId;
    }

    return chunks;
  }

  private hashContent(content: string): string {
    return computeContentHash(content);
  }

  private computeChecksum(content: string): string {
    return this.hashContent(content);
  }

  private generateQualityReport(
    documentId: string,
    versionId: string,
    sourceUri: string,
    chunks: Chunk[],
  ): IngestionQualityReport {
    const sizes = chunks.map((c) => c.content.length);
    const uniqueHashes = new Set(chunks.map((c) => c.contentHash));

    return {
      documentId,
      versionId,
      sourceUri,
      qualityMetrics: {
        totalChunks: chunks.length,
        avgChunkSize: sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0,
        minChunkSize: sizes.length > 0 ? Math.min(...sizes) : 0,
        maxChunkSize: sizes.length > 0 ? Math.max(...sizes) : 0,
        emptyChunks: chunks.filter((c) => c.content.trim().length === 0).length,
        duplicateChunks: chunks.length - uniqueHashes.size,
        parsingErrors: 0,
      },
      ingestedAt: new Date().toISOString(),
      ingestedBy: "system",
    };
  }
}
