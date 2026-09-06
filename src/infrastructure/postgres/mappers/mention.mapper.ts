import { z } from "zod";
import type { EntityMention } from "../../../domain/knowledge/knowledge.schema";
import { EntityMentionSchema } from "../../../domain/knowledge/knowledge.schema";
import { validateOrThrow } from "../../../domain/validation";

function toISOString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  return String(val);
}

export function mapMentionRow(row: Record<string, unknown>): EntityMention {
  const result: z.input<typeof EntityMentionSchema> = {
    id: String(row.id),
    tenantId: String(row.tenantId),
    mentionText: String(row.mentionText),
    normalizedForm: String(row.normalizedForm),
    entityId: row.entityId != null ? String(row.entityId) : undefined,
    sourceChunkId: String(row.sourceChunkId),
    position: (row.position as EntityMention["position"]) ?? { startChar: 0, endChar: 0 },
    confidence: parseFloat(String(row.confidence ?? "0")),
    createdAt: toISOString(row.createdAt),
  };
  return validateOrThrow(EntityMentionSchema, result, "EntityMention");
}
