import type {
  SourceRepository,
  DocumentRepository,
  DocumentVersionRepository,
  ChunkRepository,
  VectorIndexRepository,
  SourceSyncStateRepository,
} from "./ingestion/ports";
import type { EntityRepository, FactRepository } from "./extraction/ports";
import type { ExecutionRunRepository, ExecutionStepRepository } from "./execution/ports";
import type { OutboxRepository } from "./events/ports";

export interface UnitOfWork {
  readonly sourceRepository: SourceRepository;
  readonly documentRepository: DocumentRepository;
  readonly documentVersionRepository: DocumentVersionRepository;
  readonly chunkRepository: ChunkRepository;
  readonly entityRepository: EntityRepository;
  readonly factRepository: FactRepository;
  readonly mentionRepository: unknown;
  readonly executionRunRepository: ExecutionRunRepository;
  readonly executionStepRepository: ExecutionStepRepository;
  readonly outboxRepository: OutboxRepository;
  readonly vectorIndexRepository: VectorIndexRepository;
  readonly sourceSyncStateRepository: SourceSyncStateRepository;

  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface UnitOfWorkFactory {
  create(): Promise<UnitOfWork>;
  transaction<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T>;
}
