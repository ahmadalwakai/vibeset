import 'server-only';

import type { Pool, PoolClient } from '@neondatabase/serverless';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import { z } from 'zod';
import type * as DatabaseModule from '../../db/index';
import type * as PoolModule from '../../db/pool';
import { themes } from '../../db/schema/themes';
import { CacheTags } from '../../lib/cache-tags';
import type {
  MaintenanceCleanupCount,
  MaintenanceOptions,
  MaintenancePhase,
  MaintenanceSummary,
  MaintenanceUpdateCount,
} from '../../lib/maintenance';
import { maintenanceOptionsSchema } from '../../lib/validation/maintenance';
import { themeIdSchema } from '../../lib/theme-status';
import { AppError } from '../errors';

type Transaction = NeonDatabase<Record<string, unknown>>;
type Mutation<T> = { data: T; tags: string[] };
interface Context {
  options: z.output<typeof maintenanceOptionsSchema>;
  asOf: string;
  deadline: number;
  phase: MaintenancePhase;
  summary: MaintenanceSummary;
}
const BATCH_SIZE = 500;
const BUDGET_MS = 50_000;
const dialect = new PgDialect();
const resultCount = z.object({ updated: z.number().int().nonnegative() });
const popularityCount = resultCount.extend({ lockedIds: z.array(themeIdSchema) });
let databaseModule: Promise<typeof DatabaseModule> | undefined;
let poolModule: Promise<typeof PoolModule> | undefined;

/** Carries only aggregate diagnostics; never stores SQL, database errors or row identifiers. */
export class MaintenanceIncompleteError extends AppError {
  readonly summary: MaintenanceSummary;
  constructor(
    readonly phase: MaintenancePhase,
    summary: MaintenanceSummary,
  ) {
    super('INTERNAL', 'Daily maintenance did not finish');
    this.summary = { ...summary };
  }
}
function context(raw: MaintenanceOptions): Context {
  const parsed = maintenanceOptionsSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid maintenance options');
  return {
    options: parsed.data,
    asOf: parsed.data.asOf ?? new Date().toISOString(),
    deadline: Date.now() + BUDGET_MS,
    phase: 'popularity',
    summary: {
      popularityChecked: 0,
      popularityUpdated: 0,
      popularityRetried: 0,
      popularityPending: 0,
      countersChecked: 0,
      countersUpdated: 0,
      countersRetried: 0,
      countersPending: 0,
      cleanupRetried: 0,
      cleanupPending: 0,
      appRateLimitsDeleted: 0,
      authRateLimitsDeleted: 0,
      uploadsRejected: 0,
    },
  };
}
function remaining(work: Context): number {
  const milliseconds = work.deadline - Date.now();
  if (milliseconds <= 0) throw new MaintenanceIncompleteError(work.phase, work.summary);
  return milliseconds;
}
/** A timed-out operation must be cancelled before its caller can continue. */
function bounded<T>(
  work: Context,
  operation: () => Promise<T>,
  cancel: () => void,
  maximum = 30_000,
): Promise<T> {
  const milliseconds = Math.min(maximum, remaining(work));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      cancel();
      reject(new MaintenanceIncompleteError(work.phase, work.summary));
    }, milliseconds);
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    try {
      void operation().then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
async function read(work: Context, statement: SQL): Promise<unknown[]> {
  remaining(work);
  const { db } = await (databaseModule ??= import('../../db/index'));
  const query = dialect.sqlToQuery(statement),
    controller = new AbortController();
  // Drizzle's HTTP execute() does not expose per-query fetch options. The underlying
  // Neon query API does; this boundary contains SELECT statements only.
  return bounded(
    work,
    () =>
      db.$client.query(query.sql, query.params, {
        arrayMode: false,
        fullResults: false,
        fetchOptions: { signal: controller.signal },
      }),
    () => controller.abort(),
  );
}
async function acquire(work: Context, pool: Pool): Promise<PoolClient> {
  let expired = false;
  return bounded(
    work,
    async () => {
      const client = await pool.connect();
      if (expired) {
        // Pool acquisition cannot be cancelled. A late client never starts a transaction.
        client.release();
        throw new MaintenanceIncompleteError(work.phase, work.summary);
      }
      return client;
    },
    () => {
      expired = true;
    },
    5_000,
  );
}
async function transaction<T>(
  work: Context,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  remaining(work);
  const { pool } = await (poolModule ??= import('../../db/pool'));
  const client = await acquire(work, pool);
  let released = false;
  const destroy = (): void => {
    if (released) return;
    released = true;
    // Neon/node-postgres removes this client and destroys its active connection.
    // Rejecting alone would leave an unobserved write/COMMIT running on the server.
    client.release(true);
  };
  const checked = new Proxy(client, {
    get(target, property, receiver): unknown {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property !== 'query' || typeof value !== 'function') return value;
      return (...args: unknown[]): Promise<unknown> => {
        if (released)
          return Promise.reject(new MaintenanceIncompleteError(work.phase, work.summary));
        return bounded(work, () => Reflect.apply(value, target, args) as Promise<unknown>, destroy);
      };
    },
  });
  try {
    await checked.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const result = await operation(drizzle({ client: checked }));
    await checked.query('COMMIT');
    return result;
  } catch (error) {
    if (!released) {
      try {
        await checked.query('ROLLBACK');
      } catch {
        destroy();
      }
    }
    throw error;
  } finally {
    if (!released) client.release();
  }
}
async function timeout(tx: Transaction, work: Context): Promise<void> {
  const milliseconds = Math.max(1, Math.min(30_000, remaining(work)));
  const lockMilliseconds = Math.min(5_000, milliseconds);
  await tx.execute(sql`SELECT set_config('statement_timeout',${String(milliseconds)},true),
    set_config('lock_timeout',${String(lockMilliseconds)},true)`);
}
function idsSql(ids: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
}
async function snapshot(work: Context, published: boolean): Promise<string[]> {
  const scope = work.options.scope;
  const condition = and(
    published ? eq(themes.status, 'published') : undefined,
    scope ? inArray(themes.id, [...scope.themeIds]) : undefined,
  );
  const rows = await read(
    work,
    sql`SELECT ${themes.id} AS id FROM ${themes}
    ${condition ? sql`WHERE ${condition}` : sql``} ORDER BY ${themes.id}`,
  );
  return z
    .array(z.object({ id: themeIdSchema }))
    .parse(rows)
    .map((row) => row.id);
}

/** One scoring calculation statement. Locked target materialization prevents multi-row waits. */
function popularitySql(ids: readonly string[], asOf: string): SQL {
  return sql`
    WITH clock AS (SELECT (${asOf}::timestamptz AT TIME ZONE 'UTC')::date AS day),
    targets AS MATERIALIZED (
      SELECT id,published_at,created_at FROM themes
      WHERE id=ANY(${idsSql(ids)}) AND status='published'
      ORDER BY id FOR UPDATE SKIP LOCKED
    ), scores AS (
      SELECT target.id,
        coalesce((SELECT sum((stats.downloads*3.0 + stats.icon_exports*3.0 + stats.remixes*4.0
          + stats.setup_completions*5.0 + stats.views*0.2)
          * power(0.9::double precision,(clock.day-stats.day)::double precision))
          FROM theme_stats_daily stats WHERE stats.theme_id=target.id
          AND stats.day BETWEEN clock.day-29 AND clock.day),0)
        + 10.0*power(0.8::double precision,greatest(0,clock.day-
          (coalesce(target.published_at,target.created_at) AT TIME ZONE 'UTC')::date)::double precision) AS score
      FROM targets target CROSS JOIN clock
    ), changed AS (
      UPDATE themes SET popularity=scores.score FROM scores
      WHERE themes.id=scores.id AND themes.popularity IS DISTINCT FROM scores.score
      RETURNING themes.id
    )
    SELECT (SELECT count(*)::int FROM changed) AS updated,
      ARRAY(SELECT id::text FROM targets) AS "lockedIds"
  `;
}
async function popularity(work: Context): Promise<MaintenanceUpdateCount> {
  work.phase = 'popularity';
  const ids = await snapshot(work, true);
  work.summary.popularityPending = ids.length;
  const retry: string[] = [];
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    remaining(work);
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const result = await transaction(work, async (tx) => {
      await timeout(tx, work);
      return popularityCount.parse((await tx.execute(popularitySql(batch, work.asOf))).rows[0]);
    });
    work.summary.popularityUpdated += result.updated;
    work.summary.popularityChecked += result.lockedIds.length;
    work.summary.popularityPending -= result.lockedIds.length;
    const acquired = new Set(result.lockedIds);
    retry.push(...batch.filter((id) => !acquired.has(id)));
  }
  for (const id of retry) {
    remaining(work);
    work.summary.popularityRetried++;
    const result = await transaction(work, async (tx) => {
      await timeout(tx, work);
      // Wait for just one row, then use a fresh snapshot for facts committed while waiting.
      await tx.select({ id: themes.id }).from(themes).where(eq(themes.id, id)).for('update');
      await timeout(tx, work);
      return popularityCount.parse((await tx.execute(popularitySql([id], work.asOf))).rows[0]);
    });
    work.summary.popularityChecked++;
    work.summary.popularityPending--;
    work.summary.popularityUpdated += result.updated;
  }
  return {
    checked: work.summary.popularityChecked,
    updated: work.summary.popularityUpdated,
    retried: work.summary.popularityRetried,
  };
}

function countersSql(ids: readonly string[]): SQL {
  return sql`
    WITH totals AS (
      SELECT id,
        (SELECT count(*)::int FROM favorites WHERE theme_id=themes.id) AS favorites,
        coalesce((SELECT sum(downloads)::int FROM theme_stats_daily WHERE theme_id=themes.id),0) AS downloads
      FROM themes WHERE id=ANY(${idsSql(ids)})
    ), changed AS (
      UPDATE themes SET favorite_count=totals.favorites,download_count=totals.downloads
      FROM totals WHERE themes.id=totals.id
      AND (themes.favorite_count IS DISTINCT FROM totals.favorites OR themes.download_count IS DISTINCT FROM totals.downloads)
      RETURNING themes.id
    ) SELECT count(*)::int AS updated FROM changed
  `;
}
async function counterBatch(
  work: Context,
  ids: readonly string[],
  skipLocked: boolean,
): Promise<{ updated: number; lockedIds: string[] }> {
  return transaction(work, async (tx) => {
    await timeout(tx, work);
    const locked = await tx
      .select({ id: themes.id })
      .from(themes)
      .where(inArray(themes.id, [...ids]))
      .orderBy(asc(themes.id))
      .for('update', skipLocked ? { skipLocked: true } : {});
    const lockedIds = locked.map((row) => row.id);
    if (!lockedIds.length) return { updated: 0, lockedIds };
    await timeout(tx, work);
    // This separate command obtains a new READ COMMITTED snapshot after every parent lock.
    const result = await tx.execute(countersSql(lockedIds));
    return { ...resultCount.parse(result.rows[0]), lockedIds };
  });
}
async function counters(work: Context): Promise<MaintenanceUpdateCount> {
  work.phase = 'counters';
  const ids = await snapshot(work, false),
    retry: string[] = [];
  work.summary.countersPending = ids.length;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    remaining(work);
    const batch = ids.slice(offset, offset + BATCH_SIZE),
      result = await counterBatch(work, batch, true);
    work.summary.countersUpdated += result.updated;
    work.summary.countersChecked += result.lockedIds.length;
    work.summary.countersPending -= result.lockedIds.length;
    const acquired = new Set(result.lockedIds);
    retry.push(...batch.filter((id) => !acquired.has(id)));
  }
  for (const id of retry) {
    remaining(work);
    work.summary.countersRetried++;
    const result = await counterBatch(work, [id], false);
    work.summary.countersChecked++;
    work.summary.countersPending--;
    work.summary.countersUpdated += result.updated;
  }
  return {
    checked: work.summary.countersChecked,
    updated: work.summary.countersUpdated,
    retried: work.summary.countersRetried,
  };
}

function keysSql(keys: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    keys.map((key) => sql`${key}`),
    sql`, `,
  )}]::text[]`;
}
async function clean(work: Context): Promise<MaintenanceCleanupCount> {
  work.phase = 'cleanup';
  for (const definition of cleanupDefinitions(work)) {
    remaining(work);
    const selected = await read(
      work,
      sql`SELECT ${definition.key}::text AS id
      FROM ${definition.table} AS items WHERE ${definition.eligible}
      ${definition.scope ? sql`AND ${definition.key}=ANY(${definition.scope})` : sql``}
      ORDER BY ${definition.key}`,
    );
    const ids = z
      .array(z.object({ id: z.string().min(1).max(512) }))
      .parse(selected)
      .map((row) => row.id);
    work.summary.cleanupPending += ids.length;
    const retry: string[] = [];
    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      remaining(work);
      const batch = ids.slice(offset, offset + BATCH_SIZE),
        result = await cleanupBatch(work, definition, batch, true);
      work.summary[definition.count] += result.updated;
      work.summary.cleanupPending -= result.lockedIds.length;
      const acquired = new Set(result.lockedIds);
      retry.push(...batch.filter((id) => !acquired.has(id)));
    }
    for (const id of retry) {
      remaining(work);
      work.summary.cleanupRetried++;
      const result = await cleanupBatch(work, definition, [id], false);
      work.summary[definition.count] += result.updated;
      // The row may have disappeared or become ready while we waited. It is still checked.
      work.summary.cleanupPending--;
    }
  }
  return {
    appRateLimitsDeleted: work.summary.appRateLimitsDeleted,
    authRateLimitsDeleted: work.summary.authRateLimitsDeleted,
    uploadsRejected: work.summary.uploadsRejected,
  };
}

interface CleanupDefinition {
  table: SQL;
  key: SQL;
  eligible: SQL;
  scope?: SQL;
  uuid: boolean;
  count: keyof MaintenanceCleanupCount;
}
function cleanupDefinitions(work: Context): CleanupDefinition[] {
  const scope = work.options.scope;
  return [
    {
      table: sql`app_rate_limits`,
      key: sql`items.key`,
      uuid: false,
      count: 'appRateLimitsDeleted',
      eligible: sql`items.window_start < ${work.asOf}::timestamptz-interval '48 hours'`,
      ...(scope ? { scope: keysSql(scope.appRateKeys) } : {}),
    },
    {
      table: sql`rate_limit`,
      key: sql`items.key`,
      uuid: false,
      count: 'authRateLimitsDeleted',
      eligible: sql`items.last_request < extract(epoch FROM (${work.asOf}::timestamptz-interval '48 hours'))*1000`,
      ...(scope ? { scope: keysSql(scope.authRateKeys) } : {}),
    },
    {
      table: sql`uploads`,
      key: sql`items.id`,
      uuid: true,
      count: 'uploadsRejected',
      eligible: sql`items.status='pending' AND items.created_at < ${work.asOf}::timestamptz-interval '24 hours'`,
      ...(scope ? { scope: idsSql(scope.uploadIds) } : {}),
    },
  ];
}
async function cleanupBatch(
  work: Context,
  definition: CleanupDefinition,
  ids: readonly string[],
  skipLocked: boolean,
): Promise<{ updated: number; lockedIds: string[] }> {
  return transaction(work, async (tx) => {
    await timeout(tx, work);
    const candidates = definition.uuid ? idsSql(ids) : keysSql(ids);
    // Acquire bulk locks without waiting; single-row retries hold no competing row locks.
    const locked =
      await tx.execute(sql`SELECT ${definition.key}::text AS id FROM ${definition.table} AS items
      WHERE ${definition.key}=ANY(${candidates}) ORDER BY ${definition.key}
      FOR UPDATE ${skipLocked ? sql`SKIP LOCKED` : sql``}`);
    const lockedIds = z
      .array(z.object({ id: z.string().min(1).max(512) }))
      .parse(locked.rows)
      .map((row) => row.id);
    if (!lockedIds.length) return { updated: 0, lockedIds };
    await timeout(tx, work);
    const acquired = definition.uuid ? idsSql(lockedIds) : keysSql(lockedIds);
    const changed = definition.uuid
      ? sql`UPDATE uploads AS items SET status='rejected',rejection_reason='expired',updated_at=now()
          WHERE ${definition.key}=ANY(${acquired}) AND ${definition.eligible} RETURNING items.id`
      : sql`DELETE FROM ${definition.table} AS items
          WHERE ${definition.key}=ANY(${acquired}) AND ${definition.eligible} RETURNING items.key`;
    const result = await tx.execute(
      sql`WITH changed AS (${changed}) SELECT count(*)::int AS updated FROM changed`,
    );
    return { ...resultCount.parse(result.rows[0]), lockedIds };
  });
}
async function guarded<T>(work: Context, operation: () => Promise<T>): Promise<Mutation<T>> {
  try {
    return { data: await operation(), tags: [CacheTags.themes] };
  } catch {
    throw new MaintenanceIncompleteError(work.phase, work.summary);
  }
}
export async function recomputePopularity(
  options: MaintenanceOptions = {},
): Promise<Mutation<MaintenanceUpdateCount>> {
  const work = context(options);
  return guarded(work, () => popularity(work));
}
export async function reconcileCounters(
  options: MaintenanceOptions = {},
): Promise<Mutation<MaintenanceUpdateCount>> {
  const work = context(options);
  return guarded(work, () => counters(work));
}
export async function cleanup(
  options: MaintenanceOptions = {},
): Promise<Mutation<MaintenanceCleanupCount>> {
  const work = context(options);
  return guarded(work, () => clean(work));
}
export async function runDailyMaintenance(
  options: MaintenanceOptions = {},
): Promise<Mutation<MaintenanceSummary>> {
  const work = context(options);
  return guarded(work, async () => {
    await popularity(work);
    await counters(work);
    await clean(work);
    return { ...work.summary };
  });
}
