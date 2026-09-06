export interface ReconciliationReport {
  factsReconciled: number;
  factsFailed: number;
  entitiesCreated: number;
  entitiesFailed: number;
  errors: Array<{ factId: string; error: string }>;
  repositoryError?: string;
}
