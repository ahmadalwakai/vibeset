import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { collections } from '../../db/schema/collections';
import { siteSettings } from '../../db/schema/system';
import type { AdminHeroOption } from '../../lib/admin-operations';
import { parseStoredSetting, type Settings } from '../../lib/settings';
import { requireAdmin } from '../guards';

export async function getAdminSettings(): Promise<Settings> {
  await requireAdmin();
  const { db } = await import('../../db');
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings);
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    'home.hero': parseStoredSetting('home.hero', values.get('home.hero')),
    'home.announcement': parseStoredSetting('home.announcement', values.get('home.announcement')),
    features: parseStoredSetting('features', values.get('features')),
  };
}
export async function getAdminHeroOptions(): Promise<AdminHeroOption[]> {
  await requireAdmin();
  const { db } = await import('../../db');
  const rows = await db
    .select({
      slug: collections.slug,
      titleEn: collections.titleEn,
      titleAr: collections.titleAr,
      kind: collections.kind,
    })
    .from(collections)
    .where(
      and(
        eq(collections.visibility, 'public'),
        inArray(collections.kind, ['editorial', 'seasonal']),
      ),
    )
    .orderBy(asc(collections.sortOrder), asc(collections.id));
  return rows.flatMap((row) =>
    row.slug && row.kind !== 'user' ? [{ ...row, slug: row.slug, kind: row.kind }] : [],
  );
}
