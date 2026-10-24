import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { collections } from '../../db/schema/collections';
import { creatorProfiles } from '../../db/schema/moderation';
import { collectionSlugSchema, creatorHandleSchema } from '../../lib/validation/themes';
import { CacheTags, cacheLife, cacheTag } from '../cache';
import type { CollectionSeoData, CreatorSeoData } from '../../lib/seo';

export async function getCollectionMetadata(slug: string): Promise<CollectionSeoData | null> {
  'use cache';
  const validSlug = collectionSlugSchema.parse(slug);
  cacheLife('hours');
  cacheTag(CacheTags.collections, CacheTags.collection(validSlug));
  const { db } = await import('../../db');
  const [row] = await db
    .select({
      titleEn: collections.titleEn,
      titleAr: collections.titleAr,
      descriptionEn: collections.descriptionEn,
      descriptionAr: collections.descriptionAr,
    })
    .from(collections)
    .where(
      and(
        eq(collections.slug, validSlug),
        eq(collections.visibility, 'public'),
        inArray(collections.kind, ['editorial', 'seasonal']),
      ),
    )
    .limit(1);
  return row ?? null;
}
export async function getCreatorMetadata(handle: string): Promise<CreatorSeoData | null> {
  'use cache';
  const validHandle = creatorHandleSchema.parse(handle);
  cacheLife('hours');
  cacheTag(CacheTags.themes, CacheTags.creator(validHandle));
  const { db } = await import('../../db');
  const [row] = await db
    .select({ displayName: creatorProfiles.displayName, bio: creatorProfiles.bio })
    .from(creatorProfiles)
    .where(and(eq(creatorProfiles.handle, validHandle), eq(creatorProfiles.status, 'approved')))
    .limit(1);
  return row ?? null;
}
