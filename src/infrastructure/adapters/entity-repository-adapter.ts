import type { EntityRepositoryPort } from "../../application/retrieval/entity-resolver.types";
import type { PostgresEntityRepository } from "../postgres/repositories/entity-repository";

export class EntityRepositoryAdapter implements EntityRepositoryPort {
  constructor(private readonly repo: PostgresEntityRepository) {}

  async findByCanonicalName(
    name: string,
    tenantId: string,
  ): Promise<
    | { ok: true; value: Array<{ id: string; canonicalName: string; entityType: string }> }
    | { ok: false; error: Error }
  > {
    const result = await this.repo.findByCanonicalName(name, tenantId);
    if (!result.ok) {
      return result;
    }
    if (!result.value) {
      return { ok: true, value: [] };
    }
    return {
      ok: true,
      value: [
        {
          id: result.value.id,
          canonicalName: result.value.canonicalName,
          entityType: result.value.entityType,
        },
      ],
    };
  }

  async findByAlias(
    alias: string,
    tenantId: string,
  ): Promise<
    | { ok: true; value: Array<{ id: string; canonicalName: string; entityType: string }> }
    | { ok: false; error: Error }
  > {
    const result = await this.repo.findByAlias(alias, tenantId);
    if (!result.ok) {
      return result;
    }
    return {
      ok: true,
      value: result.value.map((e) => ({
        id: e.id,
        canonicalName: e.canonicalName,
        entityType: e.entityType,
      })),
    };
  }

  async searchEntities(
    query: string,
    tenantId: string,
    limit?: number,
  ): Promise<
    | {
        ok: true;
        value: Array<{ id: string; canonicalName: string; entityType: string; score: number }>;
      }
    | { ok: false; error: Error }
  > {
    return this.repo.searchEntities(query, tenantId, limit);
  }
}
