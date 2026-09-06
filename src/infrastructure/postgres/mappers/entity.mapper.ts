import { z } from "zod";
import type { CanonicalEntity } from "../../../domain/knowledge/knowledge.schema";
import { CanonicalEntitySchema } from "../../../domain/knowledge/knowledge.schema";
import { validateOrThrow } from "../../../domain/validation";

function toISOString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  return String(val);
}

export function mapEntityRow(row: Record<string, unknown>): CanonicalEntity {
  const result: z.input<typeof CanonicalEntitySchema> = {
    id: String(row.id),
    tenantId: String(row.tenantId),
    canonicalName: String(row.canonicalName),
    entityType: String(row.entityType),
    aliases: (row.aliases as string[]) ?? [],
    attributes: (row.attributes as Record<string, unknown>) ?? {},
    description: row.description != null ? String(row.description) : undefined,
    createdAt: toISOString(row.createdAt),
    validFrom: toISOString(row.validFrom),
    validTo: row.validTo != null ? toISOString(row.validTo) : undefined,
    supersededBy: row.supersededBy != null ? String(row.supersededBy) : undefined,
    createdBy: row.createdBy != null ? String(row.createdBy) : undefined,
  };
  return validateOrThrow(CanonicalEntitySchema, result, "CanonicalEntity");
}
