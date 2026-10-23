import { defineConfig } from 'drizzle-kit';
import { z } from 'zod';

const databaseUrl = z
  .url({ protocol: /^postgres(?:ql)?$/ })
  .parse(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);

export default defineConfig({
  schema: './db/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
