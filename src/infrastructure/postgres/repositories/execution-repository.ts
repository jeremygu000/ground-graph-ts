import { eq, and } from "drizzle-orm";
import type { Database } from "../client";
import { executionRuns, executionSteps, executionStepDependencies } from "../schema";
import type {
  ExecutionRunRepository,
  ExecutionStepRepository,
} from "../../../application/execution/ports";
import type { ExecutionRun, ExecutionStep } from "../../../domain/execution/types";
import { ExecutionRunSchema, ExecutionStepSchema } from "../../../domain/execution/types";
import { validateOrThrow } from "../../../domain/validation";

export class PostgresExecutionRunRepository implements ExecutionRunRepository {
  constructor(private db: Database) {}

  async create(
    run: ExecutionRun,
  ): Promise<{ ok: true; value: ExecutionRun } | { ok: false; error: Error }> {
    try {
      const validated = validateOrThrow(ExecutionRunSchema, run, "ExecutionRun.create");
      const [result] = await this.db.drizzle
        .insert(executionRuns)
        .values(validated as typeof executionRuns.$inferInsert)
        .returning();
      const validatedResult = validateOrThrow(
        ExecutionRunSchema,
        result,
        "ExecutionRun.create.result",
      );
      return { ok: true, value: validatedResult };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: ExecutionRun | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(executionRuns)
        .where(and(eq(executionRuns.id, id), eq(executionRuns.tenantId, tenantId)));
      if (!result) {
        return { ok: true, value: null };
      }
      const validated = validateOrThrow(ExecutionRunSchema, result, "ExecutionRun.findById");
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByStatus(
    status: ExecutionRun["status"],
    tenantId: string,
  ): Promise<{ ok: true; value: ExecutionRun[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(executionRuns)
        .where(and(eq(executionRuns.status, status), eq(executionRuns.tenantId, tenantId)));
      const validated = results.map((r) =>
        validateOrThrow(ExecutionRunSchema, r, "ExecutionRun.findByStatus"),
      );
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ExecutionRun["status"],
    output?: Record<string, unknown>,
    error?: string,
  ): Promise<{ ok: true; value: ExecutionRun } | { ok: false; error: Error }> {
    try {
      const updateData: Record<string, unknown> = { status };
      if (output) updateData.output = output;
      if (error) updateData.error = error;
      if (status === "running") updateData.startedAt = new Date().toISOString();
      if (["succeeded", "failed", "partially_succeeded", "cancelled"].includes(status))
        updateData.completedAt = new Date().toISOString();

      const [result] = await this.db.drizzle
        .update(executionRuns)
        .set(updateData)
        .where(and(eq(executionRuns.id, id), eq(executionRuns.tenantId, tenantId)))
        .returning();
      if (!result) {
        return { ok: false, error: new Error("Run not found") };
      }
      const validated = validateOrThrow(ExecutionRunSchema, result, "ExecutionRun.updateStatus");
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async compareAndSetStatus(
    id: string,
    tenantId: string,
    expectedStatus: ExecutionRun["status"],
    newStatus: ExecutionRun["status"],
  ): Promise<{ ok: true; value: ExecutionRun } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .update(executionRuns)
        .set({ status: newStatus })
        .where(
          and(
            eq(executionRuns.id, id),
            eq(executionRuns.tenantId, tenantId),
            eq(executionRuns.status, expectedStatus),
          ),
        )
        .returning();
      if (!result) {
        return {
          ok: false,
          error: new Error("Run not found or status mismatch (concurrent modification)"),
        };
      }
      const validated = validateOrThrow(
        ExecutionRunSchema,
        result,
        "ExecutionRun.compareAndSetStatus",
      );
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async list(
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ ok: true; value: ExecutionRun[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(executionRuns)
        .where(eq(executionRuns.tenantId, tenantId))
        .limit(limit)
        .offset(offset)
        .orderBy(executionRuns.createdAt);
      const validated = results.map((r) =>
        validateOrThrow(ExecutionRunSchema, r, "ExecutionRun.list"),
      );
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}

export class PostgresExecutionStepRepository implements ExecutionStepRepository {
  constructor(private db: Database) {}

  async create(
    step: ExecutionStep,
  ): Promise<{ ok: true; value: ExecutionStep } | { ok: false; error: Error }> {
    try {
      const validated = validateOrThrow(ExecutionStepSchema, step, "ExecutionStep.create");
      const [result] = await this.db.drizzle
        .insert(executionSteps)
        .values(validated as typeof executionSteps.$inferInsert)
        .returning();
      const validatedResult = validateOrThrow(
        ExecutionStepSchema,
        result,
        "ExecutionStep.create.result",
      );
      return { ok: true, value: validatedResult };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: ExecutionStep | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select({ step: executionSteps })
        .from(executionSteps)
        .innerJoin(executionRuns, eq(executionRuns.id, executionSteps.runId))
        .where(and(eq(executionSteps.id, id), eq(executionRuns.tenantId, tenantId)));
      if (!result?.step) {
        return { ok: true, value: null };
      }
      const validated = validateOrThrow(ExecutionStepSchema, result.step, "ExecutionStep.findById");
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByRunId(
    runId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: ExecutionStep[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select({ step: executionSteps })
        .from(executionSteps)
        .innerJoin(executionRuns, eq(executionRuns.id, executionSteps.runId))
        .where(and(eq(executionSteps.runId, runId), eq(executionRuns.tenantId, tenantId)));
      const validated = results.map((r) =>
        validateOrThrow(ExecutionStepSchema, r.step, "ExecutionStep.findByRunId"),
      );
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ExecutionStep["status"],
    output?: Record<string, unknown>,
    error?: string,
  ): Promise<{ ok: true; value: ExecutionStep } | { ok: false; error: Error }> {
    try {
      const [existing] = await this.db.drizzle
        .select({ step: executionSteps })
        .from(executionSteps)
        .innerJoin(executionRuns, eq(executionRuns.id, executionSteps.runId))
        .where(and(eq(executionSteps.id, id), eq(executionRuns.tenantId, tenantId)));

      if (!existing) {
        return { ok: false, error: new Error("Step not found") };
      }

      const updateData: Record<string, unknown> = { status };
      if (output) updateData.output = output;
      if (error) updateData.error = error;
      if (status === "running") updateData.startedAt = new Date().toISOString();
      if (["succeeded", "failed", "skipped", "cancelled"].includes(status))
        updateData.completedAt = new Date().toISOString();

      const [result] = await this.db.drizzle
        .update(executionSteps)
        .set(updateData)
        .where(eq(executionSteps.id, id))
        .returning();
      if (!result) {
        return { ok: false, error: new Error("Step not found") };
      }
      const validated = validateOrThrow(ExecutionStepSchema, result, "ExecutionStep.updateStatus");
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async compareAndSetStatus(
    id: string,
    tenantId: string,
    expectedStatus: ExecutionStep["status"],
    newStatus: ExecutionStep["status"],
  ): Promise<{ ok: true; value: ExecutionStep } | { ok: false; error: Error }> {
    try {
      const [existing] = await this.db.drizzle
        .select({ step: executionSteps })
        .from(executionSteps)
        .innerJoin(executionRuns, eq(executionRuns.id, executionSteps.runId))
        .where(
          and(
            eq(executionSteps.id, id),
            eq(executionRuns.tenantId, tenantId),
            eq(executionSteps.status, expectedStatus),
          ),
        );

      if (!existing) {
        return {
          ok: false,
          error: new Error("Step not found or status mismatch (concurrent modification)"),
        };
      }

      const [result] = await this.db.drizzle
        .update(executionSteps)
        .set({ status: newStatus })
        .where(and(eq(executionSteps.id, id), eq(executionSteps.status, expectedStatus)))
        .returning();
      if (!result) {
        return {
          ok: false,
          error: new Error("Step not found or status mismatch (concurrent modification)"),
        };
      }
      const validated = validateOrThrow(
        ExecutionStepSchema,
        result,
        "ExecutionStep.compareAndSetStatus",
      );
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async addDependency(dependency: {
    stepId: string;
    dependsOnStepId: string;
  }): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      await this.db.drizzle.insert(executionStepDependencies).values(dependency);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async getDependencies(
    stepId: string,
    _tenantId: string,
  ): Promise<{ ok: true; value: ExecutionStep[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(executionStepDependencies)
        .where(eq(executionStepDependencies.stepId, stepId));
      return { ok: true, value: results as unknown as ExecutionStep[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
