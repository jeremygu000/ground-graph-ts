import { eq, and } from "drizzle-orm";
import type { Database } from "../client";
import { executionRuns, executionSteps, executionStepDependencies } from "../schema";
import type {
  ExecutionRunRepository,
  ExecutionStepRepository,
} from "../../../application/execution/ports";
import type { ExecutionRun, ExecutionStep } from "../../../domain/execution/types";

export class PostgresExecutionRunRepository implements ExecutionRunRepository {
  constructor(private db: Database) {}

  async create(
    run: ExecutionRun,
  ): Promise<{ ok: true; value: ExecutionRun } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(executionRuns)
        .values(run as any)
        .returning();
      return { ok: true, value: result as unknown as ExecutionRun };
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
      return { ok: true, value: (result ?? null) as unknown as ExecutionRun | null };
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
        .where(and(eq(executionRuns.status, status as any), eq(executionRuns.tenantId, tenantId)));
      return { ok: true, value: results as unknown as ExecutionRun[] };
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
        .set(updateData as any)
        .where(and(eq(executionRuns.id, id), eq(executionRuns.tenantId, tenantId)))
        .returning();
      if (!result) {
        return { ok: false, error: new Error("Run not found") };
      }
      return { ok: true, value: result as unknown as ExecutionRun };
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
      return { ok: true, value: results as unknown as ExecutionRun[] };
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
      const [result] = await this.db.drizzle
        .insert(executionSteps)
        .values(step as any)
        .returning();
      return { ok: true, value: result as unknown as ExecutionStep };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    _tenantId: string,
  ): Promise<{ ok: true; value: ExecutionStep | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.id, id));
      return { ok: true, value: (result ?? null) as unknown as ExecutionStep | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByRunId(
    runId: string,
    _tenantId: string,
  ): Promise<{ ok: true; value: ExecutionStep[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.runId, runId));
      return { ok: true, value: results as unknown as ExecutionStep[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async updateStatus(
    id: string,
    _tenantId: string,
    status: ExecutionStep["status"],
    output?: Record<string, unknown>,
    error?: string,
  ): Promise<{ ok: true; value: ExecutionStep } | { ok: false; error: Error }> {
    try {
      const updateData: Record<string, unknown> = { status };
      if (output) updateData.output = output;
      if (error) updateData.error = error;
      if (status === "running") updateData.startedAt = new Date().toISOString();
      if (["succeeded", "failed", "skipped", "cancelled"].includes(status))
        updateData.completedAt = new Date().toISOString();

      const [result] = await this.db.drizzle
        .update(executionSteps)
        .set(updateData as any)
        .where(eq(executionSteps.id, id))
        .returning();
      if (!result) {
        return { ok: false, error: new Error("Step not found") };
      }
      return { ok: true, value: result as unknown as ExecutionStep };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async compareAndSetStatus(
    id: string,
    _tenantId: string,
    expectedStatus: ExecutionStep["status"],
    newStatus: ExecutionStep["status"],
  ): Promise<{ ok: true; value: ExecutionStep } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .update(executionSteps)
        .set({ status: newStatus as any })
        .where(and(eq(executionSteps.id, id), eq(executionSteps.status, expectedStatus as any)))
        .returning();
      if (!result) {
        return {
          ok: false,
          error: new Error("Step not found or status mismatch (concurrent modification)"),
        };
      }
      return { ok: true, value: result as unknown as ExecutionStep };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async addDependency(dependency: {
    stepId: string;
    dependsOnStepId: string;
  }): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      await this.db.drizzle.insert(executionStepDependencies).values(dependency as any);
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
