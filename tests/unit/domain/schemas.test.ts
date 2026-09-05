import { describe, expect, it } from "vitest";
import {
  ChunkSchema as DocumentChunkSchema,
  EvidenceReferenceSchema,
  ParsedDocumentSchema,
  SourceDescriptorSchema,
} from "../../../src/domain/documents/types";
import {
  ClaimSchema,
  CitationSchema,
  EvidenceSchema,
  EvidenceStatusSchema,
} from "../../../src/domain/evidence/types";
import {
  ExecutionRunSchema,
  ExecutionStepDependencySchema,
  ExecutionStepSchema,
  RunStatusSchema,
  StepStatusSchema,
} from "../../../src/domain/execution/types";
import {
  EvaluationCaseSchema,
  EvaluationDatasetSchema,
  EvaluationMetricSchema,
  EvaluationResultSchema,
  EvaluationStatusSchema,
} from "../../../src/domain/evaluation/types";
import { OutboxEventSchema as DomainOutboxEventSchema } from "../../../src/domain/events/types";
import {
  RetrievalQuerySchema,
  RetrievalResponseSchema,
  RetrievalResultSchema,
  RetrievalStrategySchema,
  QueryResponseSchema,
} from "../../../src/domain/retrieval/types";

describe("domain schemas", () => {
  it("validates document schemas", () => {
    expect(
      SourceDescriptorSchema.parse({
        type: "url",
        uri: "https://example.com/doc",
        metadata: { nested: { ok: true } },
      }),
    ).toEqual({
      type: "url",
      uri: "https://example.com/doc",
      metadata: { nested: { ok: true } },
    });

    expect(
      ParsedDocumentSchema.parse({
        sourceId: crypto.randomUUID(),
        versionId: crypto.randomUUID(),
        title: "Doc",
        content: "content",
        metadata: { page: 1 },
        extractedAt: "2024-01-15T10:30:00.000Z",
      }),
    ).toMatchObject({ title: "Doc" });

    expect(
      DocumentChunkSchema.parse({
        id: crypto.randomUUID(),
        documentVersionId: crypto.randomUUID(),
        principalId: crypto.randomUUID(),
        sequenceNumber: 0,
        content: "chunk",
        contentHash: "hash",
        locator: { type: "section", path: "intro" },
        metadata: { kind: "test" },
        createdAt: "2024-01-15T10:30:00.000Z",
      }),
    ).toMatchObject({ sequenceNumber: 0 });

    expect(
      EvidenceReferenceSchema.parse({
        evidenceId: crypto.randomUUID(),
        chunkId: crypto.randomUUID(),
        position: { startChar: 0, endChar: 8 },
        snippet: "snippet",
      }),
    ).toMatchObject({ snippet: "snippet" });
  });

  it("validates evaluation schemas", () => {
    const metric = EvaluationMetricSchema.parse({
      name: "precision",
      value: 0.9,
      threshold: 0.8,
      passed: true,
    });
    expect(metric.value).toBe(0.9);

    expect(EvaluationStatusSchema.parse("passed")).toBe("passed");

    const caseItem = EvaluationCaseSchema.parse({
      id: crypto.randomUUID(),
      datasetId: crypto.randomUUID(),
      question: "What changed?",
      questionType: "graph",
      tenantId: crypto.randomUUID(),
      expectedEntities: ["entity-a"],
      expectedFacts: [crypto.randomUUID()],
      expectedPaths: [
        {
          subjectId: crypto.randomUUID(),
          predicate: "connected_to",
          objectId: crypto.randomUUID(),
        },
      ],
      requiredClaims: ["claim-a"],
      forbiddenClaims: ["claim-b"],
      answerability: "answerable",
      metadata: { source: "fixture" },
    });
    expect(caseItem.tags).toEqual([]);

    const result = EvaluationResultSchema.parse({
      id: crypto.randomUUID(),
      caseId: crypto.randomUUID(),
      runId: crypto.randomUUID(),
      status: "passed",
      metrics: [metric],
      response: {
        answer: "ok",
        citations: [
          {
            evidenceId: crypto.randomUUID(),
            snippet: "evidence",
          },
        ],
        status: "answered",
      },
      latencyMs: 123,
      costUSD: 0.12,
      evaluatedAt: "2024-01-15T10:30:00.000Z",
      versionBundle: {
        workflowVersion: "1.0.0",
      },
    });
    expect(result.status).toBe("passed");

    expect(
      EvaluationDatasetSchema.parse({
        id: crypto.randomUUID(),
        name: "dataset",
        version: "1",
        description: "desc",
        cases: [caseItem],
        createdAt: "2024-01-15T10:30:00.000Z",
        createdBy: crypto.randomUUID(),
      }),
    ).toMatchObject({ name: "dataset" });
  });

  it("validates event, evidence, and execution schemas", () => {
    expect(EvidenceStatusSchema.parse("verified")).toBe("verified");

    const evidence = EvidenceSchema.parse({
      id: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      sourceVersionId: crypto.randomUUID(),
      evidenceType: "chunk",
      content: "content",
      contentHash: "hash",
      mimeType: "text/plain",
      uri: "https://example.com/evidence",
      status: "verified",
      verificationMethod: "human",
      verifiedAt: "2024-01-15T10:30:00.000Z",
      verifiedBy: "reviewer",
      createdAt: "2024-01-15T10:31:00.000Z",
      metadata: { nested: true },
    });
    expect(evidence.status).toBe("verified");

    expect(
      CitationSchema.parse({
        claimId: crypto.randomUUID(),
        evidenceId: crypto.randomUUID(),
        chunkId: crypto.randomUUID(),
        position: { startChar: 1, endChar: 4 },
        snippet: "snip",
        confidence: 0.75,
      }),
    ).toMatchObject({ confidence: 0.75 });

    expect(
      ClaimSchema.parse({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        factId: crypto.randomUUID(),
        claimText: "claim",
        status: "supported",
        confidence: 0.9,
        createdAt: "2024-01-15T10:30:00.000Z",
      }),
    ).toMatchObject({ citations: [] });

    expect(RunStatusSchema.parse("running")).toBe("running");
    expect(StepStatusSchema.parse("skipped")).toBe("skipped");

    expect(
      ExecutionStepSchema.parse({
        id: crypto.randomUUID(),
        runId: crypto.randomUUID(),
        stepName: "extract",
        stepType: "parser",
        status: "running",
        input: { source: "fixture" },
        output: { ok: true },
        error: "none",
        startedAt: "2024-01-15T10:30:00.000Z",
        completedAt: "2024-01-15T10:31:00.000Z",
        retryCount: 1,
        metadata: { stage: "step" },
      }),
    ).toMatchObject({ retryCount: 1 });

    expect(
      ExecutionRunSchema.parse({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        workflowName: "ingest",
        workflowVersion: "1.0.0",
        status: "running",
        triggerType: "manual",
        input: { source: "fixture" },
        output: { ok: true },
        error: "none",
        traceId: "trace",
        spanId: "span",
        startedAt: "2024-01-15T10:30:00.000Z",
        completedAt: "2024-01-15T10:31:00.000Z",
        metadata: { stage: "run" },
        versionBundle: {
          workflowVersion: "1.0.0",
        },
      }),
    ).toMatchObject({ workflowName: "ingest" });

    expect(
      ExecutionStepDependencySchema.parse({
        stepId: crypto.randomUUID(),
        dependsOnStepId: crypto.randomUUID(),
      }),
    ).toMatchObject({});

    expect(
      DomainOutboxEventSchema.parse({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        aggregateType: "document",
        aggregateId: crypto.randomUUID(),
        eventType: "source.created",
        payload: { hello: "world" },
        idempotencyKey: "key",
        status: "pending",
        availableAt: "2024-01-15T10:30:00.000Z",
        createdAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      }).attempts,
    ).toBe(0);
  });

  it("validates retrieval schemas", () => {
    expect(RetrievalStrategySchema.parse("graph")).toBe("graph");

    const query = RetrievalQuerySchema.parse({
      question: "How is it connected?",
      tenantId: crypto.randomUUID(),
      principalId: crypto.randomUUID(),
      strategy: "hybrid",
      filters: {
        documentIds: [crypto.randomUUID()],
        entityTypes: ["service"],
        factStatuses: ["candidate", "verified"],
        timeRange: {
          validFrom: "2024-01-15T10:30:00.000Z",
          validTo: "2024-01-15T10:31:00.000Z",
        },
      },
      budgets: { vectorResults: 5, graphResults: 3, fusionRatio: 0.5 },
    });
    expect(query.maxResults).toBe(20);

    expect(
      RetrievalResultSchema.parse({
        id: crypto.randomUUID(),
        strategy: "vector",
        score: 0.75,
        chunkId: crypto.randomUUID(),
        entityId: crypto.randomUUID(),
        factId: crypto.randomUUID(),
        content: "result",
        metadata: { source: "fixture" },
      }),
    ).toMatchObject({ score: 0.75 });

    expect(
      RetrievalResponseSchema.parse({
        queryId: crypto.randomUUID(),
        results: [],
        totalResults: 0,
        retrievalTimeMs: 15,
        strategiesUsed: ["vector", "graph"],
      }),
    ).toMatchObject({ totalResults: 0 });

    expect(
      QueryResponseSchema.parse({
        answer: "yes",
        claims: [
          {
            claimId: crypto.randomUUID(),
            claimText: "claim",
            citations: [
              {
                evidenceId: crypto.randomUUID(),
                snippet: "snippet",
              },
            ],
            confidence: 0.8,
          },
        ],
        status: "answered",
        traceId: crypto.randomUUID(),
      }),
    ).toMatchObject({ status: "answered" });
  });
});
