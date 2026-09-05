import type {
  SourceRepository,
  DocumentRepository,
  DocumentVersionRepository,
  ChunkRepository,
} from "./ingestion/ports";
import type { EntityRepository, FactRepository, MentionRepository } from "./extraction/ports";
import type { ExecutionRunRepository, ExecutionStepRepository } from "./execution/ports";
import type { OutboxRepository } from "./events/ports";

export interface UnitOfWork {
  readonly sourceRepository: SourceRepository;
  readonly documentRepository: DocumentRepository;
  readonly documentVersionRepository: DocumentVersionRepository;
  readonly chunkRepository: ChunkRepository;
  readonly entityRepository: EntityRepository;
  readonly factRepository: FactRepository;
  readonly mentionRepository: MentionRepository;
  readonly executionRunRepository: ExecutionRunRepository;
  readonly executionStepRepository: ExecutionStepRepository;
  readonly outboxRepository: OutboxRepository;

  commit(): Promise<void>;
  rollback(): Promise<void>;
  transaction<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T>;
}

export interface UnitOfWorkFactory {
  create(neo4jSession?: unknown): Promise<UnitOfWork>;
}
