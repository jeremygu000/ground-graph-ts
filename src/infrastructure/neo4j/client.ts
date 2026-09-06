import neo4j, { Driver, Session, ManagedTransaction } from "neo4j-driver";
import type { Neo4jConfig } from "./client.types";

export class Neo4jClient {
  private _driver: Driver;

  constructor(config: Neo4jConfig) {
    this._driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
      maxConnectionPoolSize: config.maxConnectionPoolSize ?? 50,
      connectionAcquisitionTimeout: 30000,
    });
  }

  get driver(): Driver {
    return this._driver;
  }

  async executeRead<T>(fn: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
    const session: Session = this.driver.session();
    try {
      return await session.executeRead(fn);
    } finally {
      await session.close();
    }
  }

  async executeWrite<T>(fn: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
    const session: Session = this.driver.session();
    try {
      return await session.executeWrite(fn);
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  async verifyConnectivity(): Promise<boolean> {
    const session = this.driver.session();
    try {
      await session.run("RETURN 1");
      return true;
    } catch {
      return false;
    } finally {
      await session.close();
    }
  }
}

let globalClient: Neo4jClient | undefined;

export function setGlobalNeo4jClient(client: Neo4jClient): void {
  globalClient = client;
}

export function getGlobalNeo4jClient(): Neo4jClient {
  if (!globalClient) {
    throw new Error("Neo4j client not initialized. Call setGlobalNeo4jClient first.");
  }
  return globalClient;
}
