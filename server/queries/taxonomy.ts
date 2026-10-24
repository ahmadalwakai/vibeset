import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { tags } from '../../db/schema/taxonomy';
import type { AestheticTagDTO, TagDTO, TagKind } from '../../lib/dto';
import { CacheTags, cacheLife, cacheTag } from '../cache';
import { toAestheticTag, toTag } from './mappers';

const columns = { slug: tags.slug, kind: tags.kind, nameEn: tags.nameEn, nameAr: tags.nameAr };

export async function listTags(kind?: TagKind): Promise<TagDTO[]> {
  'use cache';
  cacheLife('days');
  cacheTag(CacheTags.taxonomy);
  const validKind = z.enum(['aesthetic', 'style', 'mood', 'season']).optional().parse(kind);
  const { db } = await import('../../db/index');
  const rows = await db
    .select(columns)
    .from(tags)
    .where(and(eq(tags.isActive, true), validKind ? eq(tags.kind, validKind) : undefined))
    .orderBy(asc(tags.kind), asc(tags.sortOrder), asc(tags.slug));
  return rows.map(toTag);
}

export async function getAestheticTag(slug: string): Promise<AestheticTagDTO | null> {
  'use cache';
  cacheLife('days');
  cacheTag(CacheTags.taxonomy);
  const validSlug = z
    .string()
    .regex(/^[a-z0-9-]{2,40}$/)
    .parse(slug);
  const { db } = await import('../../db/index');
  const [row] = await db
    .select({ ...columns, descriptionEn: tags.descriptionEn, descriptionAr: tags.descriptionAr })
    .from(tags)
    .where(and(eq(tags.slug, validSlug), eq(tags.kind, 'aesthetic'), eq(tags.isActive, true)))
    .limit(1);
  return row ? toAestheticTag(row) : null;
}
