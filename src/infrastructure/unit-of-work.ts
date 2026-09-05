import { Database } from "./postgres/client";
import { Neo4jClient } from "./neo4j/client";
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
import type { UnitOfWork, UnitOfWorkFactory } from "../application/unit-of-work";

export class DefaultUnitOfWork implements UnitOfWork {
  sourceRepository: PostgresSourceRepository;
  documentRepository: PostgresDocumentRepository;
  documentVersionRepository: PostgresDocumentVersionRepository;
  chunkRepository: PostgresChunkRepository;
  entityRepository: PostgresEntityRepository;
  factRepository: PostgresFactRepository;
  mentionRepository: any;
  executionRunRepository: PostgresExecutionRunRepository;
  executionStepRepository: PostgresExecutionStepRepository;
  outboxRepository: PostgresOutboxRepository;

  private committed = false;

  constructor(
    private db: Database,
    neo4j: Neo4jClient,
  ) {
    void neo4j;
    this.sourceRepository = new PostgresSourceRepository(db);
    this.documentRepository = new PostgresDocumentRepository(db);
    this.documentVersionRepository = new PostgresDocumentVersionRepository(db);
    this.chunkRepository = new PostgresChunkRepository(db);
    this.entityRepository = new PostgresEntityRepository(db);
    this.factRepository = new PostgresFactRepository(db);
    this.mentionRepository = {} as any;
    this.executionRunRepository = new PostgresExecutionRunRepository(db);
    this.executionStepRepository = new PostgresExecutionStepRepository(db);
    this.outboxRepository = new PostgresOutboxRepository(db);
  }

  async commit(): Promise<void> {
    if (this.committed) {
      throw new Error("Transaction already committed");
    }
    this.committed = true;
    await this.db.transaction(async () => {
      // All changes are flushed automatically within the transaction
    });
  }

  async rollback(): Promise<void> {
    this.committed = false;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return await this.db.transaction(fn);
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
}
