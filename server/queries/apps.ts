import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { apps } from '../../db/schema/catalog';
import type { AppDTO } from '../../lib/dto';
import { CacheTags, cacheLife, cacheTag } from '../cache';
import { toApp } from './mappers';

export async function listApps(): Promise<AppDTO[]> {
  'use cache';
  cacheLife('days');
  cacheTag(CacheTags.apps);
  const { db } = await import('../../db/index');
  const rows = await db
    .select({
      slug: apps.slug,
      name: apps.name,
      aliases: apps.aliases,
      category: apps.category,
      glyph: apps.glyph,
      rank: apps.rank,
    })
    .from(apps)
    .where(eq(apps.isActive, true))
    .orderBy(asc(apps.rank), asc(apps.slug));
  return rows.map(toApp);
}
