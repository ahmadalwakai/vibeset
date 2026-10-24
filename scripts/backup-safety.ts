import { z } from 'zod';

type Environment = Readonly<Record<string, string | undefined>>;
const text = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const bucket = text.pipe(
  z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/u),
);
const pgUrl = text.pipe(z.url({ protocol: /^postgres(?:ql)?$/ })).superRefine((value, ctx) => {
  const url = new URL(value);
  if (
    !url.hostname.endsWith('.neon.tech') ||
    /-pooler\./u.test(url.hostname) ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2 ||
    url.hash ||
    (url.searchParams.has('sslmode') &&
      !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? ''))
  )
    ctx.addIssue({ code: 'custom', message: 'A direct Neon URL with TLS is required' });
});
const backupSchema = z
  .object({
    BACKUP_DATABASE_URL_UNPOOLED: pgUrl,
    BACKUP_R2_ACCOUNT_ID: z
      .string()
      .length(32)
      .regex(/^[a-f0-9]{32}$/u),
    BACKUP_R2_BUCKET: bucket,
    R2_ASSETS_BUCKET: bucket,
    BACKUP_R2_ACCESS_KEY_ID: text,
    BACKUP_R2_SECRET_ACCESS_KEY: text,
    BACKUP_CF_API_TOKEN: text,
    BACKUP_PG_MAJOR: z.enum(['14', '15', '16', '17', '18']),
  })
  .refine((value) => value.BACKUP_R2_BUCKET !== value.R2_ASSETS_BUCKET, {
    message: 'Backups require a separate private bucket',
  });

export type BackupConfig = z.infer<typeof backupSchema>;

export function parseBackupConfig(source: Environment): BackupConfig {
  return backupSchema.parse(source);
}

/** Passwords stay in child-process environment variables, never command arguments. */
export function postgresEnvironment(value: string): Record<string, string> {
  const url = new URL(pgUrl.parse(value));
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get('sslmode') ?? 'require',
    PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'vibeset-private-backup',
    ...(url.searchParams.get('channel_binding') === 'require'
      ? { PGCHANNELBINDING: 'require' }
      : {}),
  };
}

/** Require all three control-plane facts; a successful S3 upload cannot prove privacy. */
export function assertPrivateBackupPolicy(
  managed: unknown,
  custom: unknown,
  lifecycle: unknown,
): void {
  const managedResult = z.object({
    success: z.literal(true),
    result: z.object({ enabled: z.literal(false) }),
  });
  const customResult = z.object({
    success: z.literal(true),
    result: z.object({ domains: z.array(z.unknown()).length(0) }),
  });
  const lifecycleResult = z.object({
    success: z.literal(true),
    result: z.object({
      rules: z.array(
        z.object({
          enabled: z.boolean(),
          conditions: z.object({ prefix: z.string() }),
          deleteObjectsTransition: z
            .object({
              condition: z.object({
                type: z.enum(['Age', 'Date']),
                maxAge: z.number().optional(),
              }),
            })
            .optional(),
        }),
      ),
    }),
  });
  managedResult.parse(managed);
  customResult.parse(custom);
  const rules = lifecycleResult.parse(lifecycle).result.rules;
  const relevant = rules.filter(
    (rule) =>
      rule.enabled &&
      ('backups/'.startsWith(rule.conditions.prefix) ||
        rule.conditions.prefix.startsWith('backups/')),
  );
  if (
    !relevant.some(
      (rule) =>
        'backups/'.startsWith(rule.conditions.prefix) &&
        rule.deleteObjectsTransition?.condition.type === 'Age' &&
        rule.deleteObjectsTransition.condition.maxAge === 60 * 86_400,
    ) ||
    relevant.some(
      (rule) =>
        rule.deleteObjectsTransition &&
        (rule.deleteObjectsTransition.condition.type !== 'Age' ||
          rule.deleteObjectsTransition.condition.maxAge !== 60 * 86_400),
    )
  )
    throw new Error('An unambiguous 60-day backup lifecycle is required');
}

export function backupObjectKey(now: Date, run: string): string {
  const stamp = z.iso.datetime().parse(now.toISOString()).slice(0, 10);
  const suffix = text
    .pipe(
      z
        .string()
        .max(100)
        .regex(/^[a-zA-Z0-9-]+$/u),
    )
    .parse(run);
  return `backups/vibeset-${stamp}-${suffix}.sql.gz`;
}

export function assertPostgresVersions(
  serverVersion: string,
  dumpVersion: string,
  configured: string,
): void {
  const server = z
    .string()
    .regex(/^\d{6}$/u)
    .parse(serverVersion.trim());
  const dump = /^pg_dump \(PostgreSQL\) (\d+)\./u.exec(dumpVersion.trim())?.[1];
  if (String(Math.floor(Number(server) / 10_000)) !== configured || dump !== configured)
    throw new Error('PostgreSQL server, configured major and pg_dump must match');
}

export function assertRestoreTarget(
  production: string,
  target: string,
  branchId: string,
  branchResponse: unknown,
  endpointResponse: unknown,
): void {
  const origin = new URL(pgUrl.parse(production)),
    destination = new URL(pgUrl.parse(target));
  const id = text
    .pipe(
      z
        .string()
        .max(60)
        .regex(/^br-[a-z0-9-]+$/u),
    )
    .parse(branchId);
  if (origin.hostname === destination.hostname)
    throw new Error('Restore refuses the backup source endpoint');
  const branch = z
    .object({
      branch: z.object({
        id: z.literal(id),
        default: z.literal(false),
        protected: z.literal(false),
        parent_id: z.string().min(1),
      }),
    })
    .parse(branchResponse);
  const endpoints = z
    .object({
      endpoints: z.array(
        z.object({
          branch_id: z.string(),
          host: z.string(),
          type: z.string(),
        }),
      ),
    })
    .parse(endpointResponse).endpoints;
  if (
    !endpoints.some(
      (endpoint) =>
        endpoint.branch_id === branch.branch.id &&
        endpoint.host === destination.hostname &&
        endpoint.type === 'read_write',
    )
  )
    throw new Error('Restore endpoint does not belong to the explicit isolated branch');
}
