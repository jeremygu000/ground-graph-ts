import type { GraphProjectionPort } from "../../application/extraction/ports";
import type { FactRepository, EntityRepository } from "../../application/extraction/ports";
import type { KnowledgeFact } from "../../domain/knowledge/types";
import type { Result } from "../../domain/result";
import { InternalError } from "../../domain/errors";

export interface ReconciliationReport {
  factsReconciled: number;
  factsFailed: number;
  entitiesCreated: number;
  entitiesFailed: number;
  errors: Array<{ factId: string; error: string }>;
}

export class GraphReconciliationService {
  constructor(
    private graphRepo: GraphProjectionPort,
    private factRepo: FactRepository,
    private entityRepo: EntityRepository,
  ) {}

  async reconcileFact(fact: KnowledgeFact, tenantId: string): Promise<Result<void>> {
    const projectResult = await this.graphRepo.projectFact(fact);
    if (!projectResult.ok) {
      return projectResult;
    }

    if (fact.status === "verified") {
      const subjectEntity = await this.entityRepo.findById(fact.subjectId, tenantId);
      if (!subjectEntity.ok || !subjectEntity.value) {
        return {
          ok: false,
          error: new InternalError("Subject entity not found", { subjectId: fact.subjectId }),
        };
      }

      if (fact.objectId) {
        const objectEntity = await this.entityRepo.findById(fact.objectId, tenantId);
        if (!objectEntity.ok || !objectEntity.value) {
          return {
            ok: false,
            error: new InternalError("Object entity not found", { objectId: fact.objectId }),
          };
        }
      }
    }

    return { ok: true, value: undefined };
  }

  async reconcileAll(tenantId: string): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      factsReconciled: 0,
      factsFailed: 0,
      entitiesCreated: 0,
      entitiesFailed: 0,
      errors: [],
    };

    const factsResult = await this.factRepo.findByStatus("verified", tenantId);
    if (!factsResult.ok) {
      return report;
    }

    for (const fact of factsResult.value) {
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

    return report;
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

    const updateResult = await this.factRepo.updateStatus(factId, tenantId, "superseded");
    if (!updateResult.ok) {
      return updateResult;
    }

    const supersedeResult = await this.factRepo.supersede(factId, tenantId, supersededById);
    if (!supersedeResult.ok) {
      return supersedeResult;
    }

    return { ok: true, value: undefined };
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
