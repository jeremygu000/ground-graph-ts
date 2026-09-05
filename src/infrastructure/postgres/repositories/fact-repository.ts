import { eq, and } from "drizzle-orm";
import type { Database } from "../client";
import { facts } from "../schema";
import type { FactRepository } from "../../../application/extraction/ports";
import type { KnowledgeFact } from "../../../domain/knowledge/types";

export class PostgresFactRepository implements FactRepository {
  constructor(private db: Database) {}

  async create(
    fact: KnowledgeFact,
  ): Promise<{ ok: true; value: KnowledgeFact } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(facts)
        .values(fact as any)
        .returning();
      return { ok: true, value: result as unknown as KnowledgeFact };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async createMany(
    factsToCreate: KnowledgeFact[],
  ): Promise<{ ok: true; value: KnowledgeFact[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .insert(facts)
        .values(factsToCreate as any)
        .returning();
      return { ok: true, value: results as unknown as KnowledgeFact[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: KnowledgeFact | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(facts)
        .where(and(eq(facts.id, id), eq(facts.tenantId, tenantId)));
      return { ok: true, value: (result ?? null) as unknown as KnowledgeFact | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findBySubject(
    subjectId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: KnowledgeFact[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(facts)
        .where(and(eq(facts.subjectId, subjectId), eq(facts.tenantId, tenantId)));
      return { ok: true, value: results as unknown as KnowledgeFact[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByPredicate(
    predicate: string,
    tenantId: string,
  ): Promise<{ ok: true; value: KnowledgeFact[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(facts)
        .where(and(eq(facts.predicate, predicate), eq(facts.tenantId, tenantId)));
      return { ok: true, value: results as unknown as KnowledgeFact[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByStatus(
    status: KnowledgeFact["status"],
    tenantId: string,
  ): Promise<{ ok: true; value: KnowledgeFact[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(facts)
        .where(and(eq(facts.status, status as any), eq(facts.tenantId, tenantId)));
      return { ok: true, value: results as unknown as KnowledgeFact[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findTemporal(
    subjectId: string,
    predicate: string,
    tenantId: string,
    _asOf: string,
  ): Promise<{ ok: true; value: KnowledgeFact | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(facts)
        .where(
          and(
            eq(facts.subjectId, subjectId),
            eq(facts.predicate, predicate),
            eq(facts.tenantId, tenantId),
          ),
        );
      return { ok: true, value: (result ?? null) as unknown as KnowledgeFact | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: KnowledgeFact["status"],
  ): Promise<{ ok: true; value: KnowledgeFact } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .update(facts)
        .set({ status: status as any })
        .where(and(eq(facts.id, id), eq(facts.tenantId, tenantId)))
        .returning();
      if (!result) {
        return { ok: false, error: new Error("Fact not found") };
      }
      return { ok: true, value: result as unknown as KnowledgeFact };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async supersede(
    id: string,
    tenantId: string,
    supersededById: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      await this.db.drizzle
        .update(facts)
        .set({ supersededBy: supersededById })
        .where(and(eq(facts.id, id), eq(facts.tenantId, tenantId)));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
