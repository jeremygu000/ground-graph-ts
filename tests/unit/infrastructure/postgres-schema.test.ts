import { describe, expect, it } from "vitest";
import * as schema from "../../../src/infrastructure/postgres/schema";

describe("postgres schema", () => {
  it("exports the core tables and constraints", () => {
    expect(schema.sources).toBeDefined();
    expect(schema.sourceSyncState).toBeDefined();
    expect(schema.documents).toBeDefined();
    expect(schema.documentVersions).toBeDefined();
    expect(schema.chunks).toBeDefined();
    expect(schema.indexVersions).toBeDefined();
    expect(schema.chunkEmbeddings).toBeDefined();
    expect(schema.entities).toBeDefined();
    expect(schema.facts).toBeDefined();
    expect(schema.entityMentions).toBeDefined();
    expect(schema.evidence).toBeDefined();
    expect(schema.claims).toBeDefined();
    expect(schema.ingestionRuns).toBeDefined();
    expect(schema.ingestionSteps).toBeDefined();
    expect(schema.executionRuns).toBeDefined();
    expect(schema.executionSteps).toBeDefined();
    expect(schema.executionStepDependencies).toBeDefined();
    expect(schema.outboxEvents).toBeDefined();
    expect(schema.evaluationDatasets).toBeDefined();
    expect(schema.evaluationResults).toBeDefined();
  });
});
