import 'server-only';

import { createHash } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { siteSettings } from '../../db/schema/system';
import type { PublicSettingsDTO } from '../../lib/dto';
import { canonicalJson } from '../../lib/render/hash';
import { defaultSettings, settingSchemas } from '../../lib/settings';
import { CacheTags, cacheLife, cacheTag } from '../cache';

export async function getPublicSettings(): Promise<PublicSettingsDTO> {
  'use cache';
  cacheLife('hours');
  cacheTag(CacheTags.settings);
  const { db } = await import('../../db/index');
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(inArray(siteSettings.key, ['home.hero', 'home.announcement']));
  const values = new Map(rows.map(({ key, value }) => [key, value]));
  const hero = settingSchemas['home.hero'].parse(
    values.has('home.hero') ? values.get('home.hero') : defaultSettings['home.hero'],
  );
  const announcement = settingSchemas['home.announcement'].parse(
    values.has('home.announcement')
      ? values.get('home.announcement')
      : defaultSettings['home.announcement'],
  );
  return {
    heroCollectionSlug: hero.collectionSlug,
    announcement: announcement.enabled
      ? {
          ...announcement,
          id: createHash('sha256').update(canonicalJson(announcement)).digest('hex'),
        }
      : null,
  };
}
