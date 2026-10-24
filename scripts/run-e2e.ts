import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, access, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server } from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  e2eDirectory,
  e2eEnvironment,
  modeSchema,
  originSchema,
  verifyE2eApp,
  type E2eEnvironment,
} from './e2e/environment';
import { startE2eAssetServer } from './e2e/asset-server';
import { refreshE2eCaches } from './e2e/cache';
import { E2eProcesses } from './e2e/processes';

function child(
  command: string[],
  environment: E2eEnvironment,
  processes: E2eProcesses,
  output: 'inherit' | 'ignore' = 'inherit',
): ChildProcess {
  const entry = command[0];
  if (!entry) throw new Error('Missing test command');
  const childEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    NODE_ENV: z.enum(['test', 'development', 'production']).parse(environment.NODE_ENV ?? 'test'),
  };
  delete childEnvironment.NO_COLOR;
  const processChild = spawn(process.execPath, command, {
    env: childEnvironment,
    stdio: output,
    windowsHide: true,
  });
  return processes.track(processChild);
}
async function portAvailable(origin: string): Promise<void> {
  const url = new URL(origin);
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', () =>
      reject(new Error('E2E port is already in use; choose another explicit origin')),
    );
    probe.listen(Number(url.port || '80'), '0.0.0.0', () => probe.close(() => resolve()));
  });
}
export async function runE2e(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  let app: ChildProcess | undefined,
    browser: ChildProcess | undefined,
    assetServer: Server | undefined;
  let close: (() => Promise<void>) | undefined, cleanup: (() => Promise<void>) | undefined;
  let refresh: (() => Promise<void>) | undefined;
  let stage = 'configuration';
  let interrupted = false;
  const processes = new E2eProcesses();
  const cancellation = new AbortController();
  const checkCancellation = (): void => {
    if (interrupted) throw new Error('E2E interrupted');
  };
  const onInterrupt = (): void => {
    interrupted = true;
    cancellation.abort();
    // Keep our app available for the confirmed cleanup/cache-refresh boundary.
    processes.requestStop(app);
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);
  try {
    const { values } = parseArgs({
      args: [...args],
      allowPositionals: false,
      options: {
        mode: { type: 'string', default: 'local' },
        'base-url': { type: 'string' },
        'asset-origin': { type: 'string' },
        project: { type: 'string' },
        grep: { type: 'string' },
        ui: { type: 'boolean' },
        'update-snapshots': { type: 'boolean' },
        'skip-build': { type: 'boolean' },
        help: { type: 'boolean' },
      },
    });
    if (values.help) {
      process.stdout.write(
        'Usage: npm run test:e2e -- [--mode local|remote] [--base-url ORIGIN] [--asset-origin ORIGIN] [--project iphone|android|desktop] [--grep PATTERN] [--ui] [--update-snapshots] [--skip-build]\n',
      );
      return;
    }
    const mode = modeSchema.parse(values.mode),
      baseURL = originSchema.parse(
        values['base-url'] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000',
      ),
      assetOrigin = originSchema.parse(
        values['asset-origin'] ?? process.env.E2E_ASSET_ORIGIN ?? 'http://localhost:3001',
      );
    const environment = e2eEnvironment(process.env, mode, baseURL, assetOrigin);
    const runId = randomUUID();
    await mkdir(e2eDirectory(runId), { recursive: true });
    checkCancellation();
    if (mode === 'local') {
      await portAvailable(baseURL);
      await portAvailable(assetOrigin);
      checkCancellation();
      if (baseURL === assetOrigin)
        throw new Error('App and fixture asset origins must use separate ports');
      if (!values['skip-build']) {
        stage = 'production build';
        process.stdout.write('Building an isolated E2E app with loopback public origins.\n');
        const code = await processes.completion(
          child(
            ['node_modules/next/dist/bin/next', 'build'],
            { ...environment, NODE_ENV: 'production' },
            processes,
          ),
          cancellation.signal,
        );
        checkCancellation();
        if (code) throw new Error('E2E production build failed');
        await writeFile(
          '.tmp/e2e-build.json',
          JSON.stringify({
            baseURL,
            assetOrigin,
            buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(),
          }),
        );
      } else {
        const previous = z
          .strictObject({ baseURL: z.string(), assetOrigin: z.string(), buildId: z.string() })
          .parse(JSON.parse(await readFile('.tmp/e2e-build.json', 'utf8')));
        if (
          previous.baseURL !== baseURL ||
          previous.assetOrigin !== assetOrigin ||
          previous.buildId !== (await readFile('.next/BUILD_ID', 'utf8')).trim()
        )
          throw new Error('E2E skip-build requires matching compiled public origins');
      }
      checkCancellation();
      await cp('public', '.next/standalone/public', { recursive: true, force: true });
      await cp('.next/static', '.next/standalone/.next/static', { recursive: true, force: true });
      checkCancellation();
      stage = 'standalone native/font/glyph probe';
      if (
        await processes.completion(
          child(
            ['node_modules/tsx/dist/cli.mjs', 'scripts/check-standalone.ts'],
            environment,
            processes,
          ),
          cancellation.signal,
        )
      )
        throw new Error('E2E standalone renderer probe failed');
      checkCancellation();
      assetServer = await startE2eAssetServer(runId, assetOrigin);
      checkCancellation();
      app = child(
        ['.next/standalone/server.js'],
        {
          ...environment,
          NODE_ENV: 'production',
          HOSTNAME: 'localhost',
          PORT: new URL(baseURL).port || '80',
        },
        processes,
      );
    }
    stage = 'app flag/database/cache preflight';
    Object.assign(process.env, environment);
    const { fingerprintE2eDatabase } = await import('../server/e2e');
    checkCancellation();
    const fingerprint = fingerprintE2eDatabase(environment.DATABASE_URL ?? '');
    let verified = false;
    for (let attempt = 0; attempt < (mode === 'local' ? 30 : 1); attempt++) {
      checkCancellation();
      try {
        await verifyE2eApp({
          baseURL,
          fingerprint,
          bypass: environment.VERCEL_AUTOMATION_BYPASS_SECRET,
        });
        verified = true;
        break;
      } catch {
        checkCancellation();
        if (mode === 'local') await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    checkCancellation();
    if (!verified) throw new Error('E2E app fingerprint preflight failed');
    refresh = () =>
      refreshE2eCaches({
        baseURL,
        secret: environment.INTERNAL_API_SECRET ?? '',
        bypass: environment.VERCEL_AUTOMATION_BYPASS_SECRET,
      });
    await refreshE2eCaches({
      baseURL,
      secret: environment.INTERNAL_API_SECRET ?? '',
      bypass: environment.VERCEL_AUTOMATION_BYPASS_SECRET,
      preflight: true,
    });
    checkCancellation();
    const [{ seedE2eFixtures, cleanupE2eFixtures }, { pool }] = await Promise.all([
      import('./e2e/fixtures'),
      import('../db/pool'),
    ]);
    close = () => pool.end();
    const journalPath = path.join(e2eDirectory(runId), 'journal.json');
    cleanup = async (): Promise<void> => {
      try {
        await access(journalPath);
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
          return;
        throw error;
      }
      await cleanupE2eFixtures(journalPath);
    };
    checkCancellation();
    stage = 'disposable fixture seeding';
    const seeded = await seedE2eFixtures({ mode, baseURL, assetOrigin, fingerprint, runId });
    checkCancellation();
    await refresh();
    checkCancellation();
    const playwrightEnvironment = {
      ...environment,
      E2E_BASE_URL: baseURL,
      E2E_MANIFEST_PATH: seeded.manifestPath,
      E2E_PROJECT_FILTER: values.project,
      PLAYWRIGHT_JSON_OUTPUT_NAME: path.resolve('.tmp/e2e-report.json'),
    };
    const playwrightArgs = [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--reporter=line,json,html',
    ];
    if (values.project) playwrightArgs.push('--project', values.project);
    if (values.grep) playwrightArgs.push('--grep', values.grep);
    if (values.ui) playwrightArgs.push('--ui');
    if (values['update-snapshots']) playwrightArgs.push('--update-snapshots');
    process.stdout.write(
      'Running role, RTL and accessibility browser tests against disposable fixtures.\n',
    );
    stage = 'Playwright browser tests';
    browser = child(playwrightArgs, playwrightEnvironment, processes);
    process.exitCode = await processes.completion(browser, cancellation.signal);
  } catch (error) {
    process.stderr.write(
      `E2E run failed during ${stage}. Inspect local build/test output and the private run journal.\n`,
    );
    if (error instanceof Error && error.message.startsWith('E2E seed failed during '))
      process.stderr.write(`${error.message}\n`);
    if (error instanceof Error && error.message.startsWith('E2E account creation returned HTTP '))
      process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } finally {
    let workStopped = false;
    try {
      await processes.stopWork(app);
      workStopped = true;
    } catch {
      process.stderr.write(
        'E2E work may still be running; fixtures were preserved. Stop it before journal recovery.\n',
      );
      process.exitCode = 1;
    }
    if (cleanup && workStopped) {
      try {
        await cleanup();
        process.stdout.write('E2E accounts revoked and owned fixtures removed.\n');
      } catch {
        process.stderr.write(
          'E2E cleanup needs recovery using the private .tmp/e2e run journal; preserve it.\n',
        );
        process.exitCode = 1;
      }
    }
    if (refresh && workStopped) {
      try {
        await refresh();
      } catch {
        process.stderr.write('E2E fixture cache refresh still needs verification.\n');
        process.exitCode = 1;
      }
    }
    if (app)
      await processes.stop(app).catch(() => {
        process.stderr.write('E2E app termination needs verification.\n');
        process.exitCode = 1;
      });
    if (assetServer) {
      assetServer.closeAllConnections?.();
      await new Promise<void>((resolve) => assetServer?.close(() => resolve()));
    }
    if (close)
      await close().catch(() => {
        process.exitCode = 1;
      });
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
    if (interrupted) process.exitCode = 130;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void runE2e();
