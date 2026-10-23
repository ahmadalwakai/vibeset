import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';

const selectionSchema = z
  .strictObject({
    status: z.enum(['approved', 'stale', 'archived']).optional(),
    ids: z
      .string()
      .transform((value) => value.split(',').map((id) => id.trim()))
      .pipe(
        z
          .array(
            z
              .uuid()
              .length(36)
              .transform((value) => value.toLowerCase()),
          )
          .min(1)
          .max(200),
      )
      .optional(),
    limit: z.coerce.number().int().min(1).max(500).default(24),
    concurrency: z.coerce.number().int().min(1).max(4).default(3),
    force: z.boolean().default(false),
  })
  .refine((value) => !(value.ids && value.status), 'Choose ids or status')
  .refine(
    (value) => !value.ids || new Set(value.ids).size === value.ids.length,
    'IDs must be unique',
  );

export type PublishCommand = z.infer<typeof selectionSchema>;

export function parsePublishArgs(args: readonly string[]): PublishCommand {
  const { values, tokens } = parseArgs({
    args: [...args],
    options: {
      status: { type: 'string' },
      ids: { type: 'string' },
      limit: { type: 'string' },
      concurrency: { type: 'string' },
      force: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
    tokens: true,
  });
  const seen = new Set<string>();
  for (const token of tokens)
    if (token.kind === 'option') {
      if (seen.has(token.name)) throw new Error('Each option may be supplied only once');
      seen.add(token.name);
    }
  const result = selectionSchema.parse(values);
  if (result.ids && values.limit === undefined) return { ...result, limit: result.ids.length };
  return result.ids || result.status ? result : { ...result, status: 'approved' };
}

async function main(): Promise<void> {
  let command: PublishCommand;
  try {
    command = parsePublishArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(
      'Usage: themes:publish -- --status=approved|stale|archived OR --ids=uuid,uuid [--limit=24] [--concurrency=3] [--force]\n',
    );
    process.exitCode = 1;
    return;
  }
  let close: (() => Promise<void>) | undefined;
  let stopping = false;
  const stop = (): void => {
    if (!stopping)
      process.stderr.write(
        'Stopping after active publications finish; draining uploads, refreshing caches and closing the pool.\n',
      );
    stopping = true;
    process.exitCode = 130;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    const [
      { db },
      { themes },
      { pool },
      { env },
      { publishTheme, cleanupOldVersions },
      { AppError },
    ] = await Promise.all([
      import('../db/index'),
      import('../db/schema'),
      import('../db/pool'),
      import('../lib/env.server'),
      import('../server/services/theme-publish'),
      import('../server/errors'),
    ]);
    close = () => pool.end();
    const where = command.ids
      ? inArray(themes.id, command.ids)
      : command.status === 'stale'
        ? and(
            eq(themes.status, 'published'),
            or(isNull(themes.assetsSpecHash), ne(themes.assetsSpecHash, themes.specHash)),
          )
        : eq(themes.status, command.status ?? 'approved');
    const selected = await db
      .select({ id: themes.id })
      .from(themes)
      .where(where)
      .orderBy(themes.updatedAt, themes.id)
      .limit(command.limit);
    const tags = new Set<string>();
    const committedIds = new Set<string>();
    const retryIds = new Set<string>();
    let cursor = 0;
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    if (command.ids && command.ids.length <= command.limit) {
      const found = new Set(selected.map((entry) => entry.id));
      for (const id of command.ids)
        if (!found.has(id)) {
          failed += 1;
          process.stderr.write(`${id}: failed (NOT_FOUND)\n`);
        }
    }
    async function worker(): Promise<void> {
      while (!stopping) {
        const entry = selected[cursor++];
        if (!entry) return;
        try {
          const result = await publishTheme({
            themeId: entry.id,
            actor: { kind: 'system', label: 'cli' },
            force: command.force,
          });
          for (const tag of result.tags) tags.add(tag);
          committedIds.add(entry.id);
          if (result.data.skipped) skipped += 1;
          else succeeded += 1;
          process.stdout.write(
            `${entry.id}: ${result.data.skipped ? 'skipped' : `published v${result.data.assetVersion}`}\n`,
          );
          if (result.cleanup)
            try {
              await cleanupOldVersions(result.cleanup.themeId, result.cleanup.keepFromVersion);
            } catch {
              process.stderr.write(`${entry.id}: published; old-version cleanup needs a retry\n`);
              retryIds.add(entry.id);
            }
        } catch (error) {
          failed += 1;
          if (!(error instanceof AppError) || error.code === 'INTERNAL') retryIds.add(entry.id);
          process.stderr.write(
            `${entry.id}: failed (${error instanceof AppError ? error.code : 'INTERNAL'})\n`,
          );
        }
      }
    }
    await Promise.all(Array.from({ length: command.concurrency }, () => worker()));
    const allTags = [...tags];
    try {
      for (let offset = 0; offset < allTags.length; offset += 200) {
        const response = await fetch(
          new URL('/api/internal/revalidate', env.NEXT_PUBLIC_SITE_URL),
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ tags: allTags.slice(offset, offset + 200) }),
            signal: AbortSignal.timeout(10_000),
            redirect: 'error',
          },
        );
        if (!response.ok) throw new Error('Revalidation unavailable');
      }
    } catch {
      process.stderr.write('Published assets are committed; cache revalidation needs a retry.\n');
      for (const id of committedIds) retryIds.add(id);
    }
    const retry = [...retryIds];
    for (let offset = 0; offset < retry.length; offset += 200)
      process.stderr.write(
        `Retry without forcing a new version: npm run themes:publish -- --ids=${retry.slice(offset, offset + 200).join(',')}\n`,
      );
    process.stdout.write(
      `${JSON.stringify({ selected: selected.length, published: succeeded, skipped, failed, interrupted: stopping })}\n`,
    );
    if (failed && !stopping) process.exitCode = 1;
  } catch {
    process.stderr.write(
      'Publish command failed. Check database/storage configuration and retry.\n',
    );
    if (!stopping) process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (close)
      await close().catch(() => {
        process.stderr.write('Could not close the database pool.\n');
        if (!stopping) process.exitCode = 1;
      });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
