export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  maxConnectionPoolSize?: number;
}
