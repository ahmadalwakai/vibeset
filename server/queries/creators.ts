import 'server-only';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { creatorProfiles } from '../../db/schema/moderation';
import { themes } from '../../db/schema/themes';
import type { CreatorPublicDTO } from '../../lib/dto';
import { themeListQuerySchema } from '../../lib/validation/themes';
import { CacheTags, cacheLife, cacheTag } from '../cache';
import { toCreatorPublic } from './mappers';
import { readThemePage } from './shared';

export async function getCreatorPublic(
  handle: string,
  cursor?: string | null,
): Promise<CreatorPublicDTO | null> {
  'use cache';
  cacheLife('hours');
  const validHandle = z
    .string()
    .regex(/^[a-z0-9_]{3,24}$/)
    .parse(handle);
  const query = themeListQuerySchema.parse({ sort: 'new', cursor, limit: 24 });
  cacheTag(CacheTags.creator(validHandle), CacheTags.themes, CacheTags.taxonomy);
  const { db } = await import('../../db/index');
  const [row] = await db
    .select({
      userId: creatorProfiles.userId,
      handle: creatorProfiles.handle,
      displayName: creatorProfiles.displayName,
      avatarKey: creatorProfiles.avatarKey,
      bio: creatorProfiles.bio,
      links: creatorProfiles.links,
    })
    .from(creatorProfiles)
    .where(and(eq(creatorProfiles.handle, validHandle), eq(creatorProfiles.status, 'approved')))
    .limit(1);
  if (!row) return null;
  const page = await readThemePage(query, eq(themes.ownerId, row.userId));
  return toCreatorPublic(row, page);
}
