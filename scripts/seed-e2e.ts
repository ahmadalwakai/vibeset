import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { e2eEnvironment, modeSchema, originSchema, verifyE2eApp } from './e2e/environment';
import { refreshE2eCaches } from './e2e/cache';

export async function runSeedE2e(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  let close: (() => Promise<void>) | undefined;
  try {
    const { values } = parseArgs({
      args: [...args],
      options: {
        mode: { type: 'string', default: 'local' },
        'base-url': { type: 'string' },
        'asset-origin': { type: 'string' },
        cleanup: { type: 'string' },
        help: { type: 'boolean' },
      },
      allowPositionals: false,
    });
    if (values.help) {
      process.stdout.write(
        'Usage: npm run seed:e2e -- [--mode local|remote] [--base-url ORIGIN] [--asset-origin ORIGIN] [--cleanup JOURNAL]\n',
      );
      return;
    }
    const mode = modeSchema.parse(values.mode);
    const baseURL = originSchema.parse(
      values['base-url'] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    );
    const assetOrigin = originSchema.parse(
      values['asset-origin'] ?? process.env.E2E_ASSET_ORIGIN ?? 'http://localhost:3001',
    );
    const isolated = e2eEnvironment(process.env, mode, baseURL, assetOrigin);
    Object.assign(process.env, isolated);
    const { fingerprintE2eDatabase } = await import('../server/e2e');
    const fingerprint = fingerprintE2eDatabase(isolated.DATABASE_URL ?? '');
    const refresh = () =>
      refreshE2eCaches({
        baseURL,
        secret: isolated.INTERNAL_API_SECRET ?? '',
        bypass: isolated.VERCEL_AUTOMATION_BYPASS_SECRET,
      });
    const { seedE2eFixtures, cleanupE2eFixtures } = await import('./e2e/fixtures');
    const { pool } = await import('../db/pool');
    close = () => pool.end();
    if (values.cleanup) {
      await cleanupE2eFixtures(path.resolve(values.cleanup));
      process.stdout.write('Disposable E2E fixtures removed.\n');
    } else {
      await verifyE2eApp({
        baseURL,
        fingerprint,
        bypass: isolated.VERCEL_AUTOMATION_BYPASS_SECRET,
      });
      await refreshE2eCaches({
        baseURL,
        secret: isolated.INTERNAL_API_SECRET ?? '',
        bypass: isolated.VERCEL_AUTOMATION_BYPASS_SECRET,
        preflight: true,
      });
      const result = await seedE2eFixtures({
        mode,
        baseURL,
        assetOrigin,
        fingerprint,
        runId: randomUUID(),
      });
      process.stdout.write(
        `E2E manifest: ${result.manifestPath}\nKeep this private; use --cleanup with its adjacent journal.json after testing.\n`,
      );
    }
    try {
      await refresh();
    } catch {
      process.stderr.write(
        'Fixture mutation completed; refresh the app caches when its server is available.\n',
      );
    }
  } catch {
    process.stderr.write(
      'E2E seed/cleanup failed. Check the isolated database, app test-auth fingerprint and private cleanup journal.\n',
    );
    process.exitCode = 1;
  } finally {
    if (close)
      await close().catch(() => {
        process.exitCode = 1;
      });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void runSeedE2e();
