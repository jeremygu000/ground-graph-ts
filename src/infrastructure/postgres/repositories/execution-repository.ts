import { eq, and, sql } from "drizzle-orm";
import crypto from "node:crypto";
import type { Database } from "../client";
import { executionRuns, executionSteps, executionStepDependencies } from "../schema";
import type {
  ExecutionRunRepository,
  ExecutionStepRepository,
} from "../../../application/execution/ports.types";
import type { ExecutionRun, ExecutionStep } from "../../../domain/execution/execution.schema";
import {
  ExecutionRunSchema,
  ExecutionStepSchema,
} from "../../../domain/execution/execution.schema";
import { validateOrThrow } from "../../../domain/validation";

function undefinedIfNull<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

function mapExecutionRunRow(row: Record<string, unknown>): ExecutionRun {
  const input = undefinedIfNull(row.input as Record<string, unknown> | null | undefined);
  const output = undefinedIfNull(row.output as Record<string, unknown> | null | undefined);
  const error = undefinedIfNull(row.error as string | null | undefined);
  const traceId = undefinedIfNull(row.traceId as string | null | undefined);
  const spanId = undefinedIfNull(row.spanId as string | null | undefined);
  const startedAt =
    row.startedAt instanceof Date
      ? row.startedAt.toISOString()
      : undefinedIfNull(row.startedAt as string | null | undefined);
  const completedAt =
    row.completedAt instanceof Date
      ? row.completedAt.toISOString()
      : undefinedIfNull(row.completedAt as string | null | undefined);
  const metadata = undefinedIfNull(row.metadata as Record<string, unknown> | null | undefined);

  return validateOrThrow(
    ExecutionRunSchema,
    {
      ...row,
      input,
      output,
      error,
      traceId,
      spanId,
      startedAt,
      completedAt,
      metadata,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    },
    "ExecutionRun.map",
  );
}

function mapExecutionStepRow(row: Record<string, unknown>): ExecutionStep {
  const input = undefinedIfNull(row.input as Record<string, unknown> | null | undefined);
  const output = undefinedIfNull(row.output as Record<string, unknown> | null | undefined);
  const error = undefinedIfNull(row.error as string | null | undefined);
  const startedAt =
    row.startedAt instanceof Date
      ? row.startedAt.toISOString()
      : undefinedIfNull(row.startedAt as string | null | undefined);
  const completedAt =
    row.completedAt instanceof Date
      ? row.completedAt.toISOString()
      : undefinedIfNull(row.completedAt as string | null | undefined);
  const metadata = undefinedIfNull(row.metadata as Record<string, unknown> | null | undefined);

  return validateOrThrow(
    ExecutionStepSchema,
    {
      ...row,
      input,
      output,
      error,
      startedAt,
      completedAt,
      metadata,
    },
    "ExecutionStep.map",
  );
}

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
      const validatedResult = mapExecutionRunRow(result as Record<string, unknown>);
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
      return { ok: true, value: mapExecutionRunRow(result as Record<string, unknown>) };
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
      const validated = results.map((r) => mapExecutionRunRow(r as Record<string, unknown>));
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
      return { ok: true, value: mapExecutionRunRow(result as Record<string, unknown>) };
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
      return { ok: true, value: mapExecutionRunRow(result as Record<string, unknown>) };
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
      return { ok: true, value: mapExecutionStepRow(result as Record<string, unknown>) };
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
      return { ok: true, value: mapExecutionStepRow(result.step as Record<string, unknown>) };
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
      const validated = results.map((r) => mapExecutionStepRow(r.step as Record<string, unknown>));
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
      return { ok: true, value: mapExecutionStepRow(result as Record<string, unknown>) };
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
      const [result] = await this.db.drizzle
        .update(executionSteps)
        .set({ status: newStatus })
        .where(
          and(
            eq(executionSteps.id, id),
            eq(executionSteps.status, expectedStatus),
            sql`EXISTS (
              SELECT 1 FROM ${executionRuns}
              WHERE ${executionRuns.id} = ${executionSteps.runId}
              AND ${executionRuns.tenantId} = ${tenantId}
            )`,
          ),
        )
        .returning();

      if (!result) {
        return {
          ok: false,
          error: new Error("Step not found, status mismatch, or tenant mismatch"),
        };
      }

      return { ok: true, value: mapExecutionStepRow(result as Record<string, unknown>) };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async addDependency(
    stepId: string,
    dependsOnStepId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      await this.db.drizzle.transaction(async (tx) => {
        if (stepId === dependsOnStepId) {
          throw new Error("Step cannot depend on itself");
        }

        const [step] = await tx
          .select({ runId: executionSteps.runId })
          .from(executionSteps)
          .innerJoin(executionRuns, eq(executionRuns.id, executionSteps.runId))
          .where(and(eq(executionSteps.id, stepId), eq(executionRuns.tenantId, tenantId)));

        const [dependsOn] = await tx
          .select({ runId: executionSteps.runId })
          .from(executionSteps)
          .innerJoin(executionRuns, eq(executionRuns.id, executionSteps.runId))
          .where(and(eq(executionSteps.id, dependsOnStepId), eq(executionRuns.tenantId, tenantId)));

        if (!step || !dependsOn) {
          throw new Error("Step not found or tenant mismatch");
        }

        if (step.runId !== dependsOn.runId) {
          throw new Error("Cannot create cross-run dependency");
        }

        const [lockedRun] = await tx
          .select({ id: executionRuns.id })
          .from(executionRuns)
          .where(and(eq(executionRuns.id, step.runId), eq(executionRuns.tenantId, tenantId)))
          .for("update");

        if (!lockedRun) {
          throw new Error("Run not found or tenant mismatch");
        }

        const cycleCheck = await tx.execute(sql`
          WITH RECURSIVE cycle_check AS (
            SELECT ${dependsOnStepId}::uuid AS step_id, ARRAY[${dependsOnStepId}::uuid] AS path
            UNION ALL
            SELECT sd.depends_on_step_id, cc.path || sd.depends_on_step_id
            FROM execution_step_dependencies sd
            JOIN cycle_check cc ON sd.step_id = cc.step_id
            WHERE NOT (sd.depends_on_step_id = ANY(cc.path))
          )
          SELECT 1 FROM cycle_check WHERE step_id = ${stepId}::uuid LIMIT 1
        `);

        if ((cycleCheck as unknown[]).length > 0) {
          throw new Error("Dependency would create a cycle");
        }

        await tx.insert(executionStepDependencies).values({
          id: crypto.randomUUID(),
          stepId,
          dependsOnStepId,
        });
      });
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async getDependencies(
    stepId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: ExecutionStep[] } | { ok: false; error: Error }> {
    try {
      const dependencies = await this.db.drizzle
        .select({ step: executionSteps })
        .from(executionStepDependencies)
        .innerJoin(executionSteps, eq(executionSteps.id, executionStepDependencies.dependsOnStepId))
        .innerJoin(executionRuns, eq(executionRuns.id, executionSteps.runId))
        .where(
          and(eq(executionStepDependencies.stepId, stepId), eq(executionRuns.tenantId, tenantId)),
        );

      const steps = dependencies.map((d) => mapExecutionStepRow(d.step as Record<string, unknown>));
      return { ok: true, value: steps };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
