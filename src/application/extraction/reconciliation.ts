import type { GraphProjectionPort } from "../../application/extraction/ports.types";
import type { FactRepository, EntityRepository } from "../../application/extraction/ports.types";
import type { KnowledgeFact } from "../../domain/knowledge/knowledge.schema";
import type { Result } from "../../domain/result";
import { InternalError } from "../../domain/errors";

import type { ReconciliationReport } from "./reconciliation.types";

export class GraphReconciliationService {
  constructor(
    private graphRepo: GraphProjectionPort,
    private factRepo: FactRepository,
    private entityRepo: EntityRepository,
  ) {}

  async reconcileFact(fact: KnowledgeFact, tenantId: string): Promise<Result<void>> {
    if (fact.status === "verified") {
      const subjectEntity = await this.entityRepo.findById(fact.subjectId, tenantId);
      if (subjectEntity.ok && subjectEntity.value) {
        const projectEntityResult = await this.graphRepo.projectEntity({
          id: subjectEntity.value.id,
          tenantId,
          canonicalName: subjectEntity.value.canonicalName,
          entityType: subjectEntity.value.entityType,
          aliases: subjectEntity.value.aliases ?? [],
          attributes: subjectEntity.value.attributes ?? {},
          createdAt: subjectEntity.value.createdAt,
          validFrom: subjectEntity.value.validFrom,
          principalIds: subjectEntity.value.principalIds ?? [],
        });
        if (!projectEntityResult.ok) {
          return {
            ok: false,
            error: new InternalError("Failed to project subject entity", {
              subjectId: fact.subjectId,
            }),
          };
        }
      }

      if (fact.objectId) {
        const objectEntity = await this.entityRepo.findById(fact.objectId, tenantId);
        if (objectEntity.ok && objectEntity.value) {
          const projectEntityResult = await this.graphRepo.projectEntity({
            id: objectEntity.value.id,
            tenantId,
            canonicalName: objectEntity.value.canonicalName,
            entityType: objectEntity.value.entityType,
            aliases: objectEntity.value.aliases ?? [],
            attributes: objectEntity.value.attributes ?? {},
            createdAt: objectEntity.value.createdAt,
            validFrom: objectEntity.value.validFrom,
            principalIds: objectEntity.value.principalIds ?? [],
          });
          if (!projectEntityResult.ok) {
            return {
              ok: false,
              error: new InternalError("Failed to project object entity", {
                objectId: fact.objectId,
              }),
            };
          }
        }
      }
    }

    const projectResult = await this.graphRepo.projectFact(fact);
    if (!projectResult.ok) {
      return projectResult;
    }

    return { ok: true, value: undefined };
  }

  async reconcileAll(tenantId: string): Promise<Result<ReconciliationReport>> {
    const report: ReconciliationReport = {
      factsReconciled: 0,
      factsFailed: 0,
      entitiesCreated: 0,
      entitiesFailed: 0,
      errors: [],
    };

    const factsResult = await this.factRepo.findByStatus("verified", tenantId);
    if (!factsResult.ok) {
      return {
        ok: false,
        error: new InternalError("Failed to fetch verified facts for reconciliation", {
          cause: factsResult.error,
        }),
      };
    }

    const seenEntityIds = new Set<string>();

    for (const fact of factsResult.value) {
      if (fact.status === "verified") {
        if (!seenEntityIds.has(fact.subjectId)) {
          seenEntityIds.add(fact.subjectId);
          const entityResult = await this.entityRepo.findById(fact.subjectId, tenantId);
          if (entityResult.ok && entityResult.value) {
            const projectEntityResult = await this.graphRepo.projectEntity({
              id: entityResult.value.id,
              tenantId,
              canonicalName: entityResult.value.canonicalName,
              entityType: entityResult.value.entityType,
              aliases: entityResult.value.aliases ?? [],
              attributes: entityResult.value.attributes ?? {},
              createdAt: entityResult.value.createdAt,
              validFrom: entityResult.value.validFrom,
              principalIds: entityResult.value.principalIds ?? [],
            });
            if (projectEntityResult.ok) {
              report.entitiesCreated++;
            } else {
              report.entitiesFailed++;
              report.errors.push({
                entityId: fact.subjectId,
                error: "Failed to project entity",
              });
            }
          }
        }

        if (fact.objectId && !seenEntityIds.has(fact.objectId)) {
          seenEntityIds.add(fact.objectId);
          const entityResult = await this.entityRepo.findById(fact.objectId, tenantId);
          if (entityResult.ok && entityResult.value) {
            const projectEntityResult = await this.graphRepo.projectEntity({
              id: entityResult.value.id,
              tenantId,
              canonicalName: entityResult.value.canonicalName,
              entityType: entityResult.value.entityType,
              aliases: entityResult.value.aliases ?? [],
              attributes: entityResult.value.attributes ?? {},
              createdAt: entityResult.value.createdAt,
              validFrom: entityResult.value.validFrom,
              principalIds: entityResult.value.principalIds ?? [],
            });
            if (projectEntityResult.ok) {
              report.entitiesCreated++;
            } else {
              report.entitiesFailed++;
              report.errors.push({
                entityId: fact.objectId,
                error: "Failed to project entity",
              });
            }
          }
        }
      }

      const result = await this.reconcileFact(fact, tenantId);
      if (result.ok) {
        report.factsReconciled++;
      } else {
        report.factsFailed++;
        report.errors.push({
          factId: fact.id,
          error: result.error.message,
        });
      }
    }

    return { ok: true, value: report };
  }
}

export class SupersessionService {
  constructor(
    private factRepo: FactRepository,
    private entityRepo: EntityRepository,
  ) {}

  async supersedeFact(
    factId: string,
    supersededById: string,
    tenantId: string,
  ): Promise<Result<void>> {
    const factResult = await this.factRepo.findById(factId, tenantId);
    if (!factResult.ok || !factResult.value) {
      return { ok: false, error: new InternalError("Fact not found", { factId }) };
    }

    const supersededByResult = await this.factRepo.findById(supersededById, tenantId);
    if (!supersededByResult.ok || !supersededByResult.value) {
      return {
        ok: false,
        error: new InternalError("Superseding fact not found", { supersededById }),
      };
    }

    if (factId === supersededById) {
      return { ok: false, error: new InternalError("Fact cannot supersede itself") };
    }

    return this.factRepo.supersedeWithStatus(factId, tenantId, supersededById, "superseded");
  }

  async supersedeEntity(
    entityId: string,
    supersededById: string,
    tenantId: string,
  ): Promise<Result<void>> {
    if (entityId === supersededById) {
      return { ok: false, error: new InternalError("Entity cannot supersede itself") };
    }

    const supersedeResult = await this.entityRepo.supersede(entityId, tenantId, supersededById);
    if (!supersedeResult.ok) {
      return supersedeResult;
    }

    return { ok: true, value: undefined };
  }
}
