import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '../lib/env.server';
import * as tables from './schema/index';
import * as relations from './relations';

const schema = { ...tables, ...relations };

export const db = drizzle({ client: neon(env.DATABASE_URL), schema });
