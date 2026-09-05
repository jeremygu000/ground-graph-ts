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
  sourceRepository: SourceRepository;
  documentRepository: DocumentRepository;
  documentVersionRepository: DocumentVersionRepository;
  chunkRepository: ChunkRepository;
  entityRepository: EntityRepository;
  factRepository: FactRepository;
  mentionRepository: MentionRepository;
  executionRunRepository: ExecutionRunRepository;
  executionStepRepository: ExecutionStepRepository;
  outboxRepository: OutboxRepository;

  commit(): Promise<void>;
  rollback(): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export interface UnitOfWorkFactory {
  create(): Promise<UnitOfWork>;
}
