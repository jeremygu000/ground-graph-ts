-- Migration: Add single-active index constraint (M4 P1)
-- Prevents multiple active index versions per tenant/type from concurrent activations.
-- Uses a partial unique index for database-level enforcement.

CREATE UNIQUE INDEX idx_index_versions_single_active
ON index_versions (tenant_id, index_type)
WHERE is_active = true;
