import type { Database } from "./postgres/client";
import type { Neo4jClient } from "./neo4j/client";
import {
  PostgresSourceRepository,
  PostgresDocumentRepository,
  PostgresDocumentVersionRepository,
  PostgresChunkRepository,
  PostgresEntityRepository,
  PostgresFactRepository,
  PostgresExecutionRunRepository,
  PostgresExecutionStepRepository,
  PostgresOutboxRepository,
} from "./postgres/repositories";
import { PostgresSourceSyncStateRepository } from "./postgres/repositories/source-sync-state-repository";
import { PostgresVectorIndexRepository } from "./postgres/index-repository";
import type { UnitOfWork, UnitOfWorkFactory } from "../application/unit-of-work";

export class DefaultUnitOfWork implements UnitOfWork {
  sourceRepository: PostgresSourceRepository;
  documentRepository: PostgresDocumentRepository;
  documentVersionRepository: PostgresDocumentVersionRepository;
  chunkRepository: PostgresChunkRepository;
  entityRepository: PostgresEntityRepository;
  factRepository: PostgresFactRepository;
  mentionRepository: unknown;
  executionRunRepository: PostgresExecutionRunRepository;
  executionStepRepository: PostgresExecutionStepRepository;
  outboxRepository: PostgresOutboxRepository;
  vectorIndexRepository: PostgresVectorIndexRepository;
  sourceSyncStateRepository: PostgresSourceSyncStateRepository;

  private committed = false;

  constructor(db: Database, _neo4j: Neo4jClient) {
    void _neo4j;
    this.sourceRepository = new PostgresSourceRepository(db);
    this.documentRepository = new PostgresDocumentRepository(db);
    this.documentVersionRepository = new PostgresDocumentVersionRepository(db);
    this.chunkRepository = new PostgresChunkRepository(db);
    this.entityRepository = new PostgresEntityRepository(db);
    this.factRepository = new PostgresFactRepository(db);
    this.mentionRepository = null;
    this.executionRunRepository = new PostgresExecutionRunRepository(db);
    this.executionStepRepository = new PostgresExecutionStepRepository(db);
    this.outboxRepository = new PostgresOutboxRepository(db);
    this.vectorIndexRepository = new PostgresVectorIndexRepository(db);
    this.sourceSyncStateRepository = new PostgresSourceSyncStateRepository(db);
  }

  async commit(): Promise<void> {
    if (this.committed) {
      throw new Error("Transaction already committed");
    }
    this.committed = true;
  }

  async rollback(): Promise<void> {
    this.committed = false;
  }
}

export class DefaultUnitOfWorkFactory implements UnitOfWorkFactory {
  constructor(
    private db: Database,
    private _neo4j: Neo4jClient,
  ) {}

  async create(): Promise<UnitOfWork> {
    return new DefaultUnitOfWork(this.db, this._neo4j);
  }

  async transaction<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.db.transaction(async (tx: any) => {
      const uow = new TransactionalUnitOfWork(tx, this._neo4j);
      return fn(uow);
    });
  }
}

class TransactionalUnitOfWork implements UnitOfWork {
  sourceRepository: PostgresSourceRepository;
  documentRepository: PostgresDocumentRepository;
  documentVersionRepository: PostgresDocumentVersionRepository;
  chunkRepository: PostgresChunkRepository;
  entityRepository: PostgresEntityRepository;
  factRepository: PostgresFactRepository;
  mentionRepository: unknown;
  executionRunRepository: PostgresExecutionRunRepository;
  executionStepRepository: PostgresExecutionStepRepository;
  outboxRepository: PostgresOutboxRepository;
  vectorIndexRepository: PostgresVectorIndexRepository;
  sourceSyncStateRepository: PostgresSourceSyncStateRepository;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private tx: any,
    _neo4j: Neo4jClient,
  ) {
    void _neo4j;
    const txDb = {
      drizzle: this.tx,
    } as unknown as Database;
    this.sourceRepository = new PostgresSourceRepository(txDb);
    this.documentRepository = new PostgresDocumentRepository(txDb);
    this.documentVersionRepository = new PostgresDocumentVersionRepository(txDb);
    this.chunkRepository = new PostgresChunkRepository(txDb);
    this.entityRepository = new PostgresEntityRepository(txDb);
    this.factRepository = new PostgresFactRepository(txDb);
    this.mentionRepository = null;
    this.executionRunRepository = new PostgresExecutionRunRepository(txDb);
    this.executionStepRepository = new PostgresExecutionStepRepository(txDb);
    this.outboxRepository = new PostgresOutboxRepository(txDb);
    this.vectorIndexRepository = new PostgresVectorIndexRepository(txDb);
    this.sourceSyncStateRepository = new PostgresSourceSyncStateRepository(txDb);
  }

  async commit(): Promise<void> {
    // Transaction auto-commits on success
  }

  async rollback(): Promise<void> {
    // Drizzle transaction auto-rolls back on error
  }
}
