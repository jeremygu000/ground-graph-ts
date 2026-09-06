import { z } from "zod";
import type { KnowledgeFact } from "../../../domain/knowledge/knowledge.schema";
import { KnowledgeFactSchema } from "../../../domain/knowledge/knowledge.schema";
import { validateOrThrow } from "../../../domain/validation";

function toISOString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  return String(val);
}

export function mapFactRow(row: Record<string, unknown>): KnowledgeFact {
  const prov = row.provenance as {
    sourceVersionId?: string;
    chunkId?: string;
    evidenceText?: string;
  } | null;
  const provenance = {
    sourceVersionId: prov?.sourceVersionId ?? String(row.id),
    chunkId: prov?.chunkId,
    evidenceText: prov?.evidenceText,
  };
  const result: z.input<typeof KnowledgeFactSchema> = {
    id: String(row.id),
    tenantId: String(row.tenantId),
    subjectId: String(row.subjectId),
    predicate: String(row.predicate),
    objectId: row.objectId != null ? String(row.objectId) : undefined,
    objectValue: row.objectValue != null ? String(row.objectValue) : undefined,
    status: String(row.status) as z.infer<typeof KnowledgeFactSchema>["status"],
    extractionMethod: String(row.extractionMethod) as z.infer<
      typeof KnowledgeFactSchema
    >["extractionMethod"],
    confidence: parseFloat(String(row.confidence ?? "0")),
    validFrom: toISOString(row.validFrom),
    validTo: row.validTo != null ? toISOString(row.validTo) : undefined,
    observedAt: toISOString(row.observedAt),
    supersededBy: row.supersededBy != null ? String(row.supersededBy) : undefined,
    createdAt: toISOString(row.createdAt),
    createdBy: row.createdBy != null ? String(row.createdBy) : undefined,
    provenance,
  };
  return validateOrThrow(KnowledgeFactSchema, result, "KnowledgeFact");
}
