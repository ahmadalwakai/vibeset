import { parseArgs } from 'node:util';
import { z } from 'zod';

const kindSchema = z.enum(['taxonomy', 'apps', 'settings']);
export type SeedKind = z.infer<typeof kindSchema>;

export function parseSeedArgs(args: readonly string[]): { help: boolean } {
  const { values } = parseArgs({
    args: [...args],
    options: { help: { type: 'boolean' } },
    strict: true,
    allowPositionals: false,
  });
  return z.strictObject({ help: z.boolean().default(false) }).parse(values);
}

export async function runSeedCommand(
  kind: SeedKind,
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const usage = `Usage: npm run db:seed:${kind} [-- --help]\n`;
  try {
    kindSchema.parse(kind);
    if (parseSeedArgs(args).help) {
      process.stdout.write(usage);
      return;
    }
  } catch {
    process.stderr.write(usage);
    process.exitCode = 1;
    return;
  }

  let stopping = false;
  const interrupted = (signal: 'SIGINT' | 'SIGTERM'): void => {
    if (!stopping)
      process.stderr.write('Stopping after the seed statement and cache refresh finish.\n');
    stopping = true;
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
  };
  const onInterrupt = (): void => interrupted('SIGINT');
  const onTerminate = (): void => interrupted('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  try {
    const [{ seedTaxonomy, seedApps, seedSettings }, { env }] = await Promise.all([
      import('../server/services/seed-content'),
      import('../lib/env.server'),
    ]);
    if (stopping) return;
    const seeders = { taxonomy: seedTaxonomy, apps: seedApps, settings: seedSettings };
    const result = await seeders[kind]({ actor: { kind: 'system', label: `seed-${kind}` } });
    process.stdout.write(`${JSON.stringify({ kind, changed: result.data.changed })}\n`);
    if (result.tags.length) {
      try {
        const response = await fetch(
          new URL('/api/internal/revalidate', env.NEXT_PUBLIC_SITE_URL),
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ tags: result.tags }),
            signal: AbortSignal.timeout(10_000),
            redirect: 'error',
          },
        );
        if (!response.ok) throw new Error('Cache refresh unavailable');
      } catch {
        process.stderr.write(
          `Seed data is committed; retry npm run db:seed:${kind} to refresh caches when the app is reachable.\n`,
        );
      }
    }
    // Seed statements use the HTTP client; no database pool is opened by this command.
  } catch (error) {
    const { AppError } = await import('../server/errors');
    process.stderr.write(
      error instanceof AppError && error.code === 'VALIDATION'
        ? `${error.message}\n`
        : 'Seed failed. Check database configuration and retry.\n',
    );
    if (!stopping) process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  }
}
