import { Neo4jClient } from "./client";
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
              entityId: record.get("entityId"),
              path: (record.get("rels") as any[]).map((rel: any) => ({
                fromId: rel.start,
                predicate: rel.type,
                toId: rel.end,
              })),
              depth: record.get("depth"),
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
          const path = record.get("path") as any;
          return {
            path: path.segments.map((seg: any) => ({
              fromId: seg.start?.properties?.id,
              predicate: seg.relationship?.type,
              toId: seg.end?.properties?.id,
              factId: seg.relationship?.properties?.factId,
            })),
            totalHops: record.get("hops"),
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
        MATCH (e)-[:SUBJECT_OF|OBJECT*1..${depth}]-(connected:Entity)
        WHERE connected.tenantId = $tenantId
        RETURN DISTINCT connected.id AS entityId,
               'connected' AS relationship,
               length((e)-[:SUBJECT_OF|OBJECT*1..${depth}]-(connected)) AS depth
      `;

      const results = await this.client.executeRead(async (tx) => {
        const result = await tx.run(query, { entityId, tenantId });
        return result.records.map((record) => ({
          entityId: record.get("entityId"),
          relationship: record.get("relationship"),
          depth: record.get("depth"),
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
      const query = `
        MATCH (subject:Entity {id: $subjectId, tenantId: $tenantId})
        ${objectId ? "MATCH (object:Entity {id: $objectId, tenantId: $tenantId})" : ""}
        CREATE (subject)-[:SUBJECT_OF]->(fact:Fact {id: $factId, tenantId: $tenantId})-[:OBJECT]->${objectId ? "(object)" : "(value:Value {text: $objectValue})"}
        RETURN fact.id AS factId
      `;

      await this.client.executeWrite(async (tx) => {
        await tx.run(query, {
          subjectId,
          objectId,
          objectValue,
          factId,
          tenantId,
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
