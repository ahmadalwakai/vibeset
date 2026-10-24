import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { createGunzip, createGzip } from 'node:zlib';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  assertPostgresVersions,
  assertPrivateBackupPolicy,
  assertRestoreTarget,
  backupObjectKey,
  parseBackupConfig,
  postgresEnvironment,
  type BackupConfig,
} from './backup-safety';

type Environment = NodeJS.ProcessEnv;
const MAX_COMMAND_MS = 20 * 60_000;
const endpoint = (config: BackupConfig): string =>
  `https://${config.BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
function toolEnvironment(): Environment {
  return {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    LC_ALL: 'C',
  };
}

function command(program: string, args: readonly string[], env: Environment): Promise<string> {
  return new Promise<string>((resolveCommand, reject) => {
    execFile(
      program,
      [...args],
      { env, timeout: MAX_COMMAND_MS, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        // Command errors can contain connection details. Never surface their original message.
        if (error) reject(new Error('Backup command failed'));
        else resolveCommand(stdout);
      },
    );
  });
}
async function json(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Backup control-plane verification failed');
  return response.json();
}
export async function verifyPrivateBucket(config: BackupConfig): Promise<void> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${config.BACKUP_R2_ACCOUNT_ID}/r2/buckets/${encodeURIComponent(config.BACKUP_R2_BUCKET)}`;
  const [managed, custom, lifecycle] = await Promise.all([
    json(`${base}/domains/managed`, config.BACKUP_CF_API_TOKEN),
    json(`${base}/domains/custom`, config.BACKUP_CF_API_TOKEN),
    json(`${base}/lifecycle`, config.BACKUP_CF_API_TOKEN),
  ]);
  assertPrivateBackupPolicy(managed, custom, lifecycle);
}
async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
async function pipePostgres(
  mode: 'dump' | 'restore',
  file: string,
  env: Environment,
): Promise<void> {
  const child = spawn(
    mode === 'dump' ? 'pg_dump' : 'psql',
    mode === 'dump'
      ? ['--no-owner', '--no-acl', '--format=plain']
      : ['--no-psqlrc', '--quiet', '--single-transaction', '--set=ON_ERROR_STOP=1', '--file=-'],
    {
      env,
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: MAX_COMMAND_MS,
    },
  );
  const ended = new Promise<void>((resolveCommand, reject) => {
    child.once('error', () => reject(new Error('PostgreSQL backup command unavailable')));
    child.once('close', (code) =>
      code === 0 ? resolveCommand() : reject(new Error('PostgreSQL backup command failed')),
    );
  });
  if (!child.stdout || !child.stdin) throw new Error('Missing PostgreSQL process streams');
  if (mode === 'dump') child.stdin.end();
  else child.stdout.resume();
  const transferred =
    mode === 'dump'
      ? pipeline(
          child.stdout,
          createGzip({ level: 9 }),
          createWriteStream(file, { flags: 'wx', mode: 0o600 }),
        )
      : pipeline(createReadStream(file), createGunzip(), child.stdin);
  try {
    await Promise.all([ended, transferred]);
  } catch {
    child.kill('SIGKILL');
    await Promise.allSettled([ended, transferred]);
    throw new Error('PostgreSQL backup transfer failed');
  }
}
async function postgresVersion(config: BackupConfig, env: Environment): Promise<void> {
  const [server, dump] = await Promise.all([
    command(
      'psql',
      ['--no-psqlrc', '--tuples-only', '--no-align', '--command=SHOW server_version_num'],
      env,
    ),
    command('pg_dump', ['--version'], env),
  ]);
  assertPostgresVersions(server, dump, config.BACKUP_PG_MAJOR);
}
async function backup(config: BackupConfig): Promise<void> {
  await verifyPrivateBucket(config);
  const env = { ...toolEnvironment(), ...postgresEnvironment(config.BACKUP_DATABASE_URL_UNPOOLED) };
  await postgresVersion(config, env);
  const folder = await mkdtemp(join(tmpdir(), 'vibeset-backup-'));
  try {
    const key = backupObjectKey(
        new Date(),
        process.env.GITHUB_RUN_ID
          ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
          : randomUUID(),
      ),
      file = join(folder, basename(key));
    await pipePostgres('dump', file, env);
    await command('gzip', ['--test', file], toolEnvironment());
    const digest = await sha256(file),
      size = (await stat(file)).size;
    if (size < 100) throw new Error('Backup archive is unexpectedly empty');
    await verifyPrivateBucket(config);
    const aws = {
      ...toolEnvironment(),
      AWS_ACCESS_KEY_ID: config.BACKUP_R2_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: config.BACKUP_R2_SECRET_ACCESS_KEY,
      AWS_DEFAULT_REGION: 'auto',
      AWS_EC2_METADATA_DISABLED: 'true',
    };
    await command(
      'aws',
      [
        's3',
        'cp',
        file,
        `s3://${config.BACKUP_R2_BUCKET}/${key}`,
        '--endpoint-url',
        endpoint(config),
        '--only-show-errors',
        '--no-progress',
        '--metadata',
        `sha256=${digest}`,
      ],
      aws,
    );
    const head = z
      .object({ ContentLength: z.literal(size), Metadata: z.object({ sha256: z.literal(digest) }) })
      .parse(
        JSON.parse(
          await command(
            'aws',
            [
              's3api',
              'head-object',
              '--bucket',
              config.BACKUP_R2_BUCKET,
              '--key',
              key,
              '--endpoint-url',
              endpoint(config),
              '--output=json',
            ],
            aws,
          ),
        ),
      );
    process.stdout.write(
      `${JSON.stringify({ backup: key, bytes: head.ContentLength, sha256: digest, private: true })}\n`,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
async function restore(config: BackupConfig, file: string, expected: string): Promise<void> {
  const target = z.string().min(1).parse(process.env.RESTORE_DATABASE_URL),
    branchId = z
      .string()
      .max(60)
      .regex(/^br-[a-z0-9-]+$/u)
      .refine((value) => !/\s/u.test(value))
      .parse(process.env.RESTORE_NEON_BRANCH_ID),
    project = z
      .string()
      .max(60)
      .regex(/^[a-z0-9-]+$/u)
      .refine((value) => !/\s/u.test(value))
      .parse(process.env.NEON_PROJECT_ID),
    token = z.string().min(1).parse(process.env.NEON_API_KEY);
  const base = `https://console.neon.tech/api/v2/projects/${project}`;
  const [branch, endpoints] = await Promise.all([
    json(`${base}/branches/${branchId}`, token),
    json(`${base}/endpoints`, token),
  ]);
  assertRestoreTarget(config.BACKUP_DATABASE_URL_UNPOOLED, target, branchId, branch, endpoints);
  if ((await sha256(file)) !== expected) throw new Error('Restore archive checksum mismatch');
  await command('gzip', ['--test', file], toolEnvironment());
  const env = { ...toolEnvironment(), ...postgresEnvironment(target) };
  await postgresVersion(config, env);
  const tables = await command(
    'psql',
    [
      '--no-psqlrc',
      '--tuples-only',
      '--no-align',
      "--command=SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')",
    ],
    env,
  );
  if (tables.trim() !== '0') throw new Error('Restore requires a completely empty isolated branch');
  await pipePostgres('restore', file, env);
  const verified = await command(
    'psql',
    [
      '--no-psqlrc',
      '--tuples-only',
      '--no-align',
      "--command=SELECT to_regclass('public.themes') IS NOT NULL AND to_regclass('public.user') IS NOT NULL AND to_regclass('drizzle.__drizzle_migrations') IS NOT NULL",
    ],
    env,
  );
  if (verified.trim() !== 't') throw new Error('Restored schema verification failed');
  process.stdout.write(
    'Restore completed in the verified isolated branch; schema checks passed.\n',
  );
}
export async function runBackup(args: readonly string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: true,
    options: { file: { type: 'string' }, sha256: { type: 'string' } },
  });
  const mode = z
    .enum(['preflight', 'backup', 'restore'])
    .parse(positionals.length === 1 ? positionals[0] : undefined);
  const config = parseBackupConfig(process.env);
  if (mode !== 'restore' && Object.keys(values).length)
    throw new Error('Unexpected backup options');
  if (mode === 'preflight') {
    await verifyPrivateBucket(config);
    return;
  }
  if (mode === 'backup') {
    await backup(config);
    return;
  }
  const file = resolve(z.string().endsWith('.sql.gz').parse(values.file));
  const expected = z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/u)
    .parse(values.sha256);
  await restore(config, file, expected);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBackup(process.argv.slice(2)).catch(() => {
    process.stderr.write(
      'Backup operation failed. Check private-bucket policy, scoped credentials, client version and target safety; no connection details are logged.\n',
    );
    process.exitCode = 1;
  });
}
