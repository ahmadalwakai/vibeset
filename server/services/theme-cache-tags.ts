import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '../../db/index';
import { collections, collectionItems } from '../../db/schema/collections';
import { creatorProfiles } from '../../db/schema/moderation';
import { CacheTags } from '../../lib/cache-tags';
import { transitionThemeSchema } from '../../lib/theme-status';

export async function getThemeCacheTags(theme: {
  id: string;
  slug: string;
  ownerId: string | null;
}): Promise<string[]> {
  const input = transitionThemeSchema.pick({ id: true, slug: true, ownerId: true }).parse(theme);
  const [containing, creators] = await Promise.all([
    db
      .select({ slug: collections.slug })
      .from(collectionItems)
      .innerJoin(collections, eq(collectionItems.collectionId, collections.id))
      .where(eq(collectionItems.themeId, input.id)),
    input.ownerId
      ? db
          .select({ handle: creatorProfiles.handle })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, input.ownerId))
      : Promise.resolve([]),
  ]);
  return [
    ...new Set([
      CacheTags.themes,
      CacheTags.theme(input.slug),
      CacheTags.collections,
      ...containing.flatMap(({ slug }) => (slug ? [CacheTags.collection(slug)] : [])),
      ...creators.map(({ handle }) => CacheTags.creator(handle)),
    ]),
  ];
}
