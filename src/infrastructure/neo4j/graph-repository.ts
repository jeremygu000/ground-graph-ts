import neo4j from "neo4j-driver";
import { Neo4jClient } from "./client";
import { encodeNeo4jDateTime, encodeNeo4jJsonProperty } from "./codec";
import { KnowledgeFactSchema, type KnowledgeFact } from "../../domain/knowledge/knowledge.schema";
import type {
  GraphTraversalPort,
  TraversalParams,
  TraversalResult,
  PathFindingParams,
  PathResult,
  ConnectedEntity,
} from "../../application/retrieval/ports.types";

export class Neo4jGraphRepository implements GraphTraversalPort {
  constructor(private client: Neo4jClient) {}

  private readonly allowedRelationshipTypes = new Set(["SUBJECT_OF", "OBJECT", "connected"]);

  private normalizeNodeId(value: unknown): string {
    if (typeof value !== "string") {
      throw new Error("Invalid Neo4j result: expected string id");
    }
    return value;
  }

  private normalizeNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (
      value &&
      typeof value === "object" &&
      "toNumber" in value &&
      typeof (value as { toNumber?: unknown }).toNumber === "function"
    ) {
      const converted = (value as { toNumber: () => number }).toNumber();
      if (typeof converted === "number" && Number.isFinite(converted)) {
        return converted;
      }
    }
    throw new Error("Invalid Neo4j result: expected finite number");
  }

  private normalizeArray<T>(value: unknown): T[] {
    if (!Array.isArray(value)) {
      throw new Error("Invalid Neo4j result: expected array");
    }
    return value as T[];
  }

  private normalizeRelationshipType(value: unknown): string {
    if (typeof value !== "string" || !this.allowedRelationshipTypes.has(value)) {
      throw new Error("Invalid Neo4j result: unexpected relationship type");
    }
    return value;
  }

  private normalizePathSegments(value: unknown): Array<{
    start?: { properties?: Record<string, unknown> };
    relationship?: { type?: unknown; properties?: Record<string, unknown> };
    end?: { properties?: Record<string, unknown> };
  }> {
    if (!neo4j.isPath(value)) {
      throw new Error("Invalid Neo4j result: expected path");
    }
    const path = value as { segments: unknown };
    return this.normalizeArray(path.segments ?? []);
  }

  async traverse(
    params: TraversalParams,
    tenantId: string,
  ): Promise<{ ok: true; value: TraversalResult[] } | { ok: false; error: Error }> {
    try {
      const query = `
        MATCH (start:Entity {id: $seedId, tenantId: $tenantId})
        MATCH path = (start)-[:SUBJECT_OF|OBJECT*1..${params.maxDepth ?? 3}]-(connected:Entity)
        WHERE connected.tenantId = $tenantId
          AND all(node IN nodes(path) WHERE node.tenantId = $tenantId)
          AND all(rel IN relationships(path) WHERE rel.tenantId = $tenantId)
        ${params.validAsOf ? "AND (connected.validFrom IS NULL OR connected.validFrom <= $validAsOf)" : ""}
        RETURN connected.id AS entityId, length(path) AS depth, path
        LIMIT 100
      `;

      const results = await this.client.executeRead(async (tx) => {
        const allResults: TraversalResult[] = [];
        for (const seedId of params.seedEntityIds) {
          const result = await tx.run(query, {
            seedId,
            tenantId,
            validAsOf: params.validAsOf,
          });
          const records = result.records;
          for (const record of records) {
            const path = this.normalizePathSegments(record.get("path"));
            allResults.push({
              entityId: this.normalizeNodeId(record.get("entityId")),
              path: path.map((segment) => ({
                fromId: this.normalizeNodeId(segment.start?.properties?.id),
                predicate: this.normalizeRelationshipType(segment.relationship?.type),
                toId: this.normalizeNodeId(segment.end?.properties?.id),
              })),
              depth: this.normalizeNumber(record.get("depth")),
            });
          }
        }
        return allResults;
      });

      return { ok: true, value: results };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findPaths(
    params: PathFindingParams,
    tenantId: string,
  ): Promise<{ ok: true; value: PathResult[] } | { ok: false; error: Error }> {
    try {
      const query = `
        MATCH path = (start:Entity {id: $startId, tenantId: $tenantId})
         -[*1..${params.maxHops ?? 3}]-(end:Entity {id: $endId, tenantId: $tenantId})
        WHERE all(node IN nodes(path) WHERE node.tenantId = $tenantId)
          AND all(rel IN relationships(path) WHERE rel.tenantId = $tenantId)
        RETURN path, length(path) AS hops
        ORDER BY hops
        LIMIT 10
      `;

      const results = await this.client.executeRead(async (tx) => {
        const result = await tx.run(query, {
          startId: params.startEntityId,
          endId: params.endEntityId,
          tenantId,
        });
        return result.records.map((record) => {
          const path = this.normalizePathSegments(record.get("path"));
          return {
            path: path.map((seg) => ({
              fromId: this.normalizeNodeId(seg.start?.properties?.id),
              predicate: this.normalizeRelationshipType(seg.relationship?.type),
              toId: this.normalizeNodeId(seg.end?.properties?.id),
              ...(seg.relationship?.properties?.factId
                ? { factId: this.normalizeNodeId(seg.relationship.properties.factId) }
                : {}),
            })),
            totalHops: this.normalizeNumber(record.get("hops")),
          };
        });
      });

      return { ok: true, value: results };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findConnectedEntities(
    entityId: string,
    depth: number,
    tenantId: string,
  ): Promise<{ ok: true; value: ConnectedEntity[] } | { ok: false; error: Error }> {
    try {
      const query = `
        MATCH (e:Entity {id: $entityId, tenantId: $tenantId})
        MATCH p = (e)-[:SUBJECT_OF|OBJECT*1..${depth}]-(connected:Entity)
        WHERE connected.tenantId = $tenantId
          AND all(node IN nodes(p) WHERE node.tenantId = $tenantId)
          AND all(rel IN relationships(p) WHERE rel.tenantId = $tenantId)
        RETURN DISTINCT connected.id AS entityId,
               'connected' AS relationship,
                 length(p) AS depth
      `;

      const results = await this.client.executeRead(async (tx) => {
        const result = await tx.run(query, { entityId, tenantId });
        return result.records.map((record) => ({
          entityId: this.normalizeNodeId(record.get("entityId")),
          relationship: this.normalizeRelationshipType(record.get("relationship")),
          depth: this.normalizeNumber(record.get("depth")),
        }));
      });

      return { ok: true, value: results };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async projectFact(
    fact: KnowledgeFact,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      const validated = KnowledgeFactSchema.parse(fact);
      const hasObjectEntity = validated.objectId !== undefined;
      const hasObjectValue = validated.objectValue !== undefined;

      if (!hasObjectEntity && !hasObjectValue) {
        throw new Error("Knowledge fact must have objectId or objectValue");
      }

      const factProps = {
        id: validated.id,
        tenantId: validated.tenantId,
        subjectId: validated.subjectId,
        predicate: validated.predicate,
        objectId: validated.objectId ?? null,
        objectValue: validated.objectValue ?? null,
        status: validated.status,
        extractionMethod: validated.extractionMethod,
        confidence: validated.confidence,
        validFrom: encodeNeo4jDateTime(validated.validFrom),
        validTo: validated.validTo ? encodeNeo4jDateTime(validated.validTo) : null,
        supersededBy: validated.supersededBy ?? null,
        createdBy: validated.createdBy ?? null,
        observedAt: encodeNeo4jDateTime(validated.observedAt),
        createdAt: encodeNeo4jDateTime(validated.createdAt),
        provenanceJson: encodeNeo4jJsonProperty(validated.provenance),
      };

      const objectMatch = hasObjectEntity
        ? "MATCH (object:Entity {id: $objectId, tenantId: $tenantId})"
        : "";
      const objectWith = hasObjectEntity ? "WITH subject, fact, object" : "WITH subject, fact";
      const objectMerge = hasObjectEntity
        ? "MERGE (fact)-[objectRel:OBJECT {factId: $factId, tenantId: $tenantId}]->(object)"
        : "MERGE (fact)-[objectRel:OBJECT {factId: $factId, tenantId: $tenantId}]->(value:Value {text: $objectValue, tenantId: $tenantId})";

      const query = `
        MATCH (subject:Entity {id: $subjectId, tenantId: $tenantId})
        ${objectMatch}
        MERGE (fact:Fact {id: $factId, tenantId: $tenantId})
        ON CREATE SET fact += $factProps
        ${objectWith}
        MERGE (subject)-[subjectRel:SUBJECT_OF {factId: $factId, tenantId: $tenantId}]->(fact)
        ${objectMerge}
        RETURN fact.id AS factId
      `;

      const result = await this.client.executeWrite(async (tx) => {
        const executionResult = await tx.run(query, {
          subjectId: validated.subjectId,
          objectId: validated.objectId ?? null,
          objectValue: validated.objectValue ?? null,
          factId: validated.id,
          tenantId: validated.tenantId,
          factProps,
        });

        if (executionResult.records.length === 0) {
          throw new Error("Projection target not found or tenant mismatch");
        }

        return executionResult.records[0]?.get("factId");
      });

      if (typeof result !== "string" || result !== validated.id) {
        throw new Error("Neo4j fact projection failed to return the projected fact id");
      }

      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async deleteFact(
    factId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      const query = `
        MATCH (fact:Fact {id: $factId, tenantId: $tenantId})
        DETACH DELETE fact
      `;

      await this.client.executeWrite(async (tx) => {
        await tx.run(query, { factId, tenantId });
      });

      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
