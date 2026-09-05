import { Neo4jClient } from "./client";
import { KnowledgeFactSchema } from "../../domain/knowledge/types";
import type {
  GraphTraversalPort,
  TraversalParams,
  TraversalResult,
  PathFindingParams,
  PathResult,
  ConnectedEntity,
} from "../../application/retrieval/ports";

export class Neo4jGraphRepository implements GraphTraversalPort {
  constructor(private client: Neo4jClient) {}

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
    return value;
  }

  private normalizeObject<T extends object>(value: unknown): T {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Invalid Neo4j result: expected object");
    }
    return value as T;
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
        ${params.validAsOf ? "AND (connected.validFrom IS NULL OR connected.validFrom <= $validAsOf)" : ""}
        RETURN connected.id AS entityId, length(path) AS depth, relationships(path) AS rels
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
            allResults.push({
              entityId: this.normalizeNodeId(record.get("entityId")),
              path: this.normalizeArray<{ start: unknown; type: unknown; end: unknown }>(
                record.get("rels"),
              ).map((rel) => {
                const segment = rel as { start: unknown; type: unknown; end: unknown };
                return {
                  fromId: this.normalizeNodeId(segment.start),
                  predicate: String(segment.type),
                  toId: this.normalizeNodeId(segment.end),
                };
              }),
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
          const path = this.normalizeObject<{
            segments?: Array<{
              start?: { properties?: Record<string, unknown> };
              relationship?: { type?: unknown; properties?: Record<string, unknown> };
              end?: { properties?: Record<string, unknown> };
            }>;
          }>(record.get("path"));
          return {
            path: (path.segments ?? []).map((seg) => ({
              fromId: this.normalizeNodeId(seg.start?.properties?.id),
              predicate: String(seg.relationship?.type),
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
        RETURN DISTINCT connected.id AS entityId,
               'connected' AS relationship,
                length(p) AS depth
      `;

      const results = await this.client.executeRead(async (tx) => {
        const result = await tx.run(query, { entityId, tenantId });
        return result.records.map((record) => ({
          entityId: this.normalizeNodeId(record.get("entityId")),
          relationship: String(record.get("relationship")),
          depth: this.normalizeNumber(record.get("depth")),
        }));
      });

      return { ok: true, value: results };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async projectFact(
    subjectId: string,
    _predicate: string,
    objectId: string | null,
    objectValue: string | null,
    factId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      const fact = KnowledgeFactSchema.parse({
        id: factId,
        tenantId,
        subjectId,
        predicate: _predicate,
        objectId: objectId ?? undefined,
        objectValue: objectValue ?? undefined,
        status: "candidate",
        extractionMethod: "rule",
        confidence: 1,
        validFrom: new Date().toISOString(),
        observedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        provenance: { sourceVersionId: factId },
      });

      const factProps = {
        id: fact.id,
        tenantId: fact.tenantId,
        subjectId: fact.subjectId,
        predicate: fact.predicate,
        status: fact.status,
        extractionMethod: fact.extractionMethod,
        confidence: fact.confidence,
        validFrom: fact.validFrom,
        validTo: fact.validTo ?? null,
        observedAt: fact.observedAt,
        supersededBy: fact.supersededBy ?? null,
        createdAt: fact.createdAt,
        createdBy: fact.createdBy ?? null,
        objectId: fact.objectId ?? null,
        objectValue: fact.objectValue ?? null,
        payloadJson: JSON.stringify(fact),
      };

      const query = `
        MATCH (subject:Entity {id: $subjectId, tenantId: $tenantId})
        ${objectId ? "MATCH (object:Entity {id: $objectId, tenantId: $tenantId})" : ""}
        MERGE (fact:Fact {id: $factId, tenantId: $tenantId})
        ON CREATE SET fact += $factProps
        WITH subject, fact${objectId ? ", object" : ""}
        MERGE (subject)-[subjectRel:SUBJECT_OF {factId: $factId, tenantId: $tenantId}]->(fact)
        ${objectId ? "MERGE (fact)-[objectRel:OBJECT {factId: $factId, tenantId: $tenantId}]->(object)" : "MERGE (fact)-[objectRel:OBJECT {factId: $factId, tenantId: $tenantId}]->(value:Value {text: $objectValue, tenantId: $tenantId})"}
        RETURN fact.id AS factId
      `;

      await this.client.executeWrite(async (tx) => {
        await tx.run(query, {
          subjectId,
          objectId,
          objectValue,
          factId,
          tenantId,
          factProps,
        });
      });

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
