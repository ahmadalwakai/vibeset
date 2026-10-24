import 'server-only';

import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { themes } from '../../db/schema/themes';
import type { Paginated, ThemeCardDTO, ThemeDetailDTO, ThemeListQuery } from '../../lib/dto';
import { themeListQuerySchema } from '../../lib/validation/themes';
import { CacheTags, cacheLife, cacheTag } from '../cache';
import { toThemeDetail } from './mappers';
import { hydrateThemeRows, readThemePage, themeCardColumns } from './shared';

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,159}$/);

export async function listThemes(query: ThemeListQuery): Promise<Paginated<ThemeCardDTO>> {
  'use cache';
  cacheLife('hours');
  cacheTag(CacheTags.themes, CacheTags.taxonomy);
  return readThemePage(themeListQuerySchema.parse(query));
}

export async function getThemeDetail(slug: string): Promise<ThemeDetailDTO | null> {
  'use cache';
  cacheLife('hours');
  const validSlug = slugSchema.parse(slug);
  cacheTag(CacheTags.themes, CacheTags.taxonomy, CacheTags.theme(validSlug));
  const { db } = await import('../../db/index');
  const [row] = await db
    .select({
      ...themeCardColumns,
      descriptionEn: themes.descriptionEn,
      descriptionAr: themes.descriptionAr,
      spec: themes.spec,
      remixOfId: themes.remixOfId,
      updatedAt: themes.updatedAt,
    })
    .from(themes)
    .where(and(eq(themes.slug, validSlug), eq(themes.status, 'published')))
    .limit(1);
  if (!row) return null;
  const [hydrated] = await hydrateThemeRows([row]);
  if (!hydrated) return null;
  const [remixOf] = row.remixOfId
    ? await db
        .select({ slug: themes.slug, nameEn: themes.nameEn, nameAr: themes.nameAr })
        .from(themes)
        .where(and(eq(themes.id, row.remixOfId), eq(themes.status, 'published')))
        .limit(1)
    : [];
  return toThemeDetail({ ...hydrated, remixOf: remixOf ?? null });
}

export async function getRelatedThemes(input: {
  themeId: string;
  aestheticSlug: string;
  limit?: number;
}): Promise<ThemeCardDTO[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(CacheTags.themes, CacheTags.taxonomy);
  const value = z
    .object({
      themeId: z.uuid(),
      aestheticSlug: slugSchema,
      limit: z.number().int().min(1).max(24).default(12),
    })
    .parse(input);
  return (
    await readThemePage(
      { tags: [value.aestheticSlug], sort: 'trending', limit: value.limit },
      ne(themes.id, value.themeId),
    )
  ).items;
}

export async function getTopThemeSlugs(limit: number): Promise<string[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(CacheTags.themes);
  const value = z.number().int().min(1).max(50_000).parse(limit);
  const { db } = await import('../../db/index');
  const rows = await db
    .select({ slug: themes.slug })
    .from(themes)
    .where(eq(themes.status, 'published'))
    .orderBy(desc(themes.popularity), desc(themes.id))
    .limit(value);
  return rows.map(({ slug }) => slug);
}
