import 'server-only';

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  SITEMAP_ENTITY_LIMIT,
  SITEMAP_STATIC_PATHS,
  sitemapPageSchema,
  type SitemapEntity,
} from '../../lib/sitemap';
import { CacheTags, cacheLife, cacheTag } from '../cache';

/** All public seasonal details remain accessible outside their Home display window. */
const entities = sql`
  SELECT path, NULL::timestamptz AS modified FROM (VALUES ${sql.join(
    SITEMAP_STATIC_PATHS.map((path) => sql`(${path}::text)`),
    sql`,`,
  )}) pages(path)
  UNION ALL SELECT '/t/'||slug,updated_at FROM themes WHERE status='published'
  UNION ALL SELECT '/a/'||slug,updated_at FROM tags WHERE kind='aesthetic' AND is_active=true
  UNION ALL SELECT '/collections/'||slug,updated_at FROM collections
    WHERE visibility='public' AND kind IN ('editorial','seasonal') AND slug IS NOT NULL
  UNION ALL SELECT '/c/'||handle,updated_at FROM creator_profiles WHERE status='approved'
`;
export async function countSitemapEntities(): Promise<number> {
  'use cache';
  cacheLife('hours');
  cacheTag(CacheTags.themes, CacheTags.taxonomy, CacheTags.collections);
  const { db } = await import('../../db');
  const result = await db.execute(
    sql`SELECT count(*)::bigint::text AS total FROM (${entities}) eligible`,
  );
  return z
    .object({
      total: z
        .string()
        .regex(/^[0-9]+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
    })
    .parse(result.rows[0]).total;
}
export async function readSitemapEntities(page: number): Promise<SitemapEntity[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(CacheTags.themes, CacheTags.taxonomy, CacheTags.collections);
  const offset = sitemapPageSchema.parse(page) * SITEMAP_ENTITY_LIMIT;
  const { db } = await import('../../db');
  const result =
    await db.execute(sql`SELECT path,to_char(modified AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "lastModified"
    FROM (${entities}) eligible ORDER BY path COLLATE "C" LIMIT ${SITEMAP_ENTITY_LIMIT} OFFSET ${offset}`);
  return z
    .array(
      z.object({
        path: z.string().min(1).max(2048),
        lastModified: z.iso.datetime({ offset: true }).nullable(),
      }),
    )
    .max(SITEMAP_ENTITY_LIMIT)
    .parse(result.rows);
}
