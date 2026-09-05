import { TypeRegistry } from './registry';

export function migrate(): void {
  // This will be implemented when running actual migrations
  throw new Error('Migration must be run via drizzle-kit');
}

export const registry = new TypeRegistry();
