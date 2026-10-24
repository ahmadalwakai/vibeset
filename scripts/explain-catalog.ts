import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Pool, neonConfig, type PoolClient } from '@neondatabase/serverless';
import { z } from 'zod';
import { playgroundStateSchema, renderSampleSpec } from '../content/render-sample';
import { specHash } from '../lib/render/hash';
import { themeListQuerySchema } from '../lib/validation/themes';
import { encodeCursor, encodeOffsetCursor } from '../lib/utils/cursor';

const postgresUrl = z.url({ protocol: /^postgres(?:ql)?$/ });
const statementSchema = z.object({
  query: z.string().startsWith('select '),
  params: z.array(z.unknown()),
});

/** Refuse normal/production endpoints before loading the application's lazy database module. */
export function catalogExplainEndpoint(
  source: Readonly<Record<string, string | undefined>>,
): string {
  if (source.NODE_ENV === 'production' || source.VERCEL_ENV === 'production')
    throw new Error('Production is refused');
  const test = postgresUrl.parse(source.TEST_DATABASE_URL);
  const endpoint = (value: string): string => {
    const url = new URL(value);
    return `${url.hostname.replace('-pooler.', '.')}:${url.port || '5432'}`;
  };
  postgresUrl.parse(source.DATABASE_URL);
  for (const ordinary of [source.DATABASE_URL, source.DATABASE_URL_UNPOOLED]) {
    if (ordinary && endpoint(postgresUrl.parse(ordinary)) === endpoint(test))
      throw new Error('An isolated TEST_DATABASE_URL is required');
  }
  return test;
}

type CapturedStatement = z.infer<typeof statementSchema>;

async function captureStatement(input: unknown): Promise<CapturedStatement> {
  const query = themeListQuerySchema.parse(input);
  const { readThemePage } = await import('../server/queries/shared');
  let captured: CapturedStatement | undefined;
  const previous = neonConfig.fetchFunction;
  neonConfig.fetchFunction = async (
    _url: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    if (typeof init?.body !== 'string') throw new Error('Unexpected Neon request');
    captured = statementSchema.parse(JSON.parse(init.body));
    // Stop before transport: fixtures remain invisible outside the dedicated transaction.
    throw new Error('Catalog SQL captured');
  };
  try {
    await readThemePage(query);
  } catch (error) {
    if (!captured) throw error;
  } finally {
    neonConfig.fetchFunction = previous;
  }
  if (!captured) throw new Error('Catalog statement was not captured');
  return captured;
}

export async function explainCatalog(
  source: Readonly<Record<string, string | undefined>>,
  count = 1200,
  candidateIndex = false,
): Promise<unknown> {
  const endpoint = catalogExplainEndpoint(source);
  z.number().int().min(1000).max(10000).parse(count);
  const originalEnvironment = { ...process.env };
  // This process is a standalone harness. Its only runtime database endpoint is TEST.
  Object.assign(process.env, {
    DATABASE_URL: endpoint,
    DATABASE_URL_UNPOOLED: endpoint,
    NODE_ENV: 'test',
  });
  const pool = new Pool({ connectionString: endpoint, max: 1, idleTimeoutMillis: 1000 });
  let client: PoolClient | undefined;
  const runId = randomUUID();
  const prefix = `p15-${runId.slice(0, 8)}`;
  const ids = Array.from({ length: count }, () => randomUUID());
  const tagIds = Array.from({ length: 10 }, () => randomUUID());
  const now = Date.now();
  const baseTime = new Date(now).toISOString();
  let transactionOpen = false;
  try {
    client = await pool.connect();
    const spec = renderSampleSpec(playgroundStateSchema.parse({}));
    const hash = await specHash(spec);
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '10s'");
    let candidateDdl: string | null = null;
    if (candidateIndex) {
      const existing = await client.query<{ name: string | null }>(
        "SELECT to_regclass('public.themes_pub_effective_new_idx')::text AS name",
      );
      if (!existing.rows[0]?.name) {
        candidateDdl = await readFile(
          new URL('../drizzle/migrations/0002_effective_new_sort.sql', import.meta.url),
          'utf8',
        );
        await client.query(candidateDdl);
      }
    }
    const before = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM themes',
    );
    for (let index = 0; index < tagIds.length; index++) {
      await client.query('INSERT INTO tags(id,slug,kind,name_en,name_ar) VALUES($1,$2,$3,$4,$5)', [
        tagIds[index],
        `${prefix}-${index}`,
        index < 2 ? 'aesthetic' : 'mood',
        `Fixture ${index}`,
        `اختبار ${index}`,
      ]);
    }
    const colors = [
      'pink',
      'red',
      'orange',
      'yellow',
      'green',
      'teal',
      'blue',
      'purple',
      'brown',
      'black',
      'white',
      'gray',
      'multi',
    ];
    for (let offset = 0; offset < count; offset += 100) {
      const rows = ids.slice(offset, offset + 100).map((id, localIndex) => {
        const index = offset + localIndex;
        return {
          id,
          slug: `${prefix}-${index}`,
          name_en: index % 50 === 0 ? `Lavender dream ${index}` : `Catalogue fixture ${index}`,
          name_ar:
            index % 100 === 0
              ? null
              : index % 60 === 0
                ? `حرير ناعم ${index}`
                : `ثيم تجريبي ${index}`,
          color: colors[index % colors.length],
          popularity: count - index,
          downloads: (index * 73) % count,
          published_at: index % 100 === 0 ? null : new Date(now - index * 1000).toISOString(),
          created_at: new Date(now - index * 1000).toISOString(),
        };
      });
      await client.query(
        `INSERT INTO themes(id,slug,status,source,name_en,name_ar,spec,spec_hash,color_family,popularity,download_count,published_at,created_at,tags_text)
         SELECT x.id,x.slug,'published','admin',x.name_en,x.name_ar,$1::jsonb,$2,x.color::color_family,x.popularity,x.downloads,x.published_at,x.created_at,'performance fixture'
         FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,slug text,name_en text,name_ar text,color text,popularity float8,downloads integer,published_at timestamptz,created_at timestamptz)`,
        [JSON.stringify(spec), hash, JSON.stringify(rows)],
      );
    }
    await client.query(
      `INSERT INTO theme_tags(theme_id,tag_id)
       SELECT x.id,CASE WHEN x.ordinality % 5 = 0 THEN $2::uuid ELSE $3::uuid END FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id,ordinality)
       UNION ALL SELECT x.id,($4::uuid[])[1 + (x.ordinality % 8)::integer] FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id,ordinality)`,
      [ids, tagIds[0], tagIds[1], tagIds.slice(2)],
    );
    // Flush the fixture inserts' GIN pending lists as normal vacuum would, then collect statistics.
    // This avoids benchmarking only the transient pending-list state of a bulk insert.
    await client.query(
      "SELECT gin_clean_pending_list(indexrelid) FROM pg_index WHERE indrelid='themes'::regclass AND indexrelid IN (SELECT oid FROM pg_class WHERE relname IN ('themes_search_idx','themes_name_en_trgm_idx','themes_name_ar_trgm_idx'))",
    );
    // Real statistics and normal planner settings; never disable sequential scans.
    await client.query('ANALYZE themes');
    await client.query('ANALYZE tags');
    await client.query('ANALYZE theme_tags');
    const variants: [string, unknown][] = [
      ['trending:first', { sort: 'trending' }],
      ['popular:first', { sort: 'popular' }],
      ['new:first', { sort: 'new' }],
      [
        'trending:cursor',
        {
          sort: 'trending',
          cursor: encodeCursor({ k: 'trending', s: count / 2, id: ids[500] ?? runId }),
        },
      ],
      [
        'popular:cursor',
        {
          sort: 'popular',
          cursor: encodeCursor({ k: 'popular', s: count / 2, id: ids[500] ?? runId }),
        },
      ],
      [
        'new:cursor',
        {
          sort: 'new',
          cursor: encodeCursor({
            k: 'new',
            s: new Date(now - 500000).toISOString(),
            id: ids[500] ?? runId,
          }),
        },
      ],
      ['color', { color: 'purple' }],
      ['tag', { tags: [`${prefix}-0`] }],
      ['tags:intersection', { tags: [`${prefix}-0`, `${prefix}-2`] }],
      ['filters:combined', { sort: 'new', tags: [`${prefix}-0`], color: 'purple' }],
      ['ids', { ids: ids.slice(0, 100).reverse() }],
      ['search:english', { q: 'lavender' }],
      ['search:arabic', { q: 'حرير' }],
      ['search:typo', { q: 'lavnder' }],
      ['search:offset', { q: 'fixture', cursor: encodeOffsetCursor(24) }],
      ['search:filtered', { q: 'lavender', color: 'purple' }],
    ];
    const results: unknown[] = [];
    for (const [variant, input] of variants) {
      const statement = await captureStatement(input);
      const result = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.query}`,
        statement.params,
      );
      results.push({
        variant,
        input,
        sql: statement.query,
        params: statement.params,
        plan: result.rows[0]?.['QUERY PLAN'],
      });
    }
    const indexes = await client.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('themes','theme_tags','tags') ORDER BY indexname",
    );
    const published = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM themes WHERE status='published'",
    );
    await client.query('ROLLBACK');
    transactionOpen = false;
    const remaining = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM themes WHERE id=ANY($1::uuid[])',
      [ids],
    );
    if (remaining.rows[0]?.count !== '0') throw new Error('Fixture rollback verification failed');
    // ANALYZE statistics can outlive rollback: restore estimates to the real, fixture-free data.
    await client.query('ANALYZE themes');
    await client.query('ANALYZE tags');
    await client.query('ANALYZE theme_tags');
    return {
      runId,
      generatedAt: new Date().toISOString(),
      fixtureCount: count,
      fixturePublishedAt: baseTime,
      existingThemeCount: before.rows[0]?.count,
      publishedDuringExplain: published.rows[0]?.count,
      cleanup: 'ROLLBACK confirmed; zero fixture IDs remain',
      indexes: indexes.rows,
      results,
      candidateDdl,
    };
  } finally {
    try {
      if (client && transactionOpen) {
        await client.query('ROLLBACK');
        await client.query('ANALYZE themes');
        await client.query('ANALYZE tags');
        await client.query('ANALYZE theme_tags');
      }
    } finally {
      client?.release();
      await pool.end();
      for (const key of Object.keys(process.env))
        if (!(key in originalEnvironment)) delete process.env[key];
      Object.assign(process.env, originalEnvironment);
    }
  }
}

async function main(): Promise<void> {
  try {
    const { values } = parseArgs({
      options: {
        count: { type: 'string', default: '1200' },
        output: { type: 'string', default: '.tmp/p15-catalog-explain.json' },
        'candidate-index': { type: 'boolean', default: false },
      },
    });
    const output = resolve(z.string().min(1).parse(values.output));
    const report = await explainCatalog(
      process.env,
      Number(values.count),
      values['candidate-index'],
    );
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(
      `Catalog EXPLAIN saved; all temporary fixtures rolled back. Report: ${output}\n`,
    );
  } catch {
    process.stderr.write(
      'Catalog EXPLAIN failed. Use a nonproduction, distinct TEST_DATABASE_URL and --count 1000..10000. No endpoint or credential is logged.\n',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
