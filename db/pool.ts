import { Pool } from '@neondatabase/serverless';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { env } from '../lib/env.server';
import * as tables from './schema/index';
import * as relations from './relations';

const schema = { ...tables, ...relations };

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  idleTimeoutMillis: 10_000,
});

pool.on('error', (error: Error): void => {
  console.error({ scope: 'db.pool', message: error.message });
});
attachDatabasePool(pool);

export const dbPool = drizzle({ client: pool, schema });
