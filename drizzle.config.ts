import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/infrastructure/postgres/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://groundgraph:change-me-local-only@127.0.0.1:5432/groundgraph',
  },
});
