import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

/** Migrations must start from an empty template, never a schema-only copy of live tables. */
export async function prepareTestDatabase(source: NodeJS.ProcessEnv): Promise<void> {
  if (source.VERCEL_ENV === 'production' || source.NODE_ENV === 'production')
    throw new Error('CI migrations refuse production');
  const value = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(source.TEST_DATABASE_URL);
  const url = new URL(value);
  if (!url.hostname.endsWith('.neon.tech') || /-pooler\./u.test(url.hostname))
    throw new Error('CI migrations require the explicit direct Neon test URL');
  for (const ordinary of [source.DATABASE_URL, source.DATABASE_URL_UNPOOLED])
    if (ordinary && new URL(ordinary).hostname.replace(/-pooler(?=\.)/u, '') === url.hostname)
      throw new Error('CI migrations require a distinct test endpoint');
  const rows = z
    .array(z.object({ count: z.string() }))
    .length(1)
    .parse(
      await neon(value).query(
        "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')",
        [],
        { fetchOptions: { signal: AbortSignal.timeout(15_000) } },
      ),
    );
  if (rows[0]?.count !== '0')
    throw new Error('CI parent must contain no application tables or migration history');
  await new Promise<void>((accept, reject) => {
    const child = spawn(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'migrate'], {
      env: { ...source, DATABASE_URL: value, DATABASE_URL_UNPOOLED: value },
      stdio: 'ignore',
      timeout: 120_000,
    });
    child.once('error', () => reject(new Error('CI migration command unavailable')));
    child.once('close', (code) =>
      code === 0
        ? accept()
        : reject(new Error('CI migration failed; no connection details are logged')),
    );
  });
  process.stdout.write('Migrations completed in the verified empty isolated branch.\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepareTestDatabase(process.env).catch(() => {
    process.stderr.write(
      'CI database preparation failed. Check the empty-template branch and migration configuration.\n',
    );
    process.exitCode = 1;
  });
}
