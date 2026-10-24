import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index';
import { collections } from '../../db/schema/collections';
import { auditLog, siteSettings } from '../../db/schema/system';
import { parseStoredSetting, settingKeySchema } from '../../lib/settings';
import type { FeaturesSetting, SettingKey, Settings } from '../../lib/settings';
import { adminUpdateSettingSchema } from '../../lib/validation/admin-operations';
import type { Actor } from '../../lib/theme-status';
import { CacheTags } from '../../lib/cache-tags';
import { AppError } from '../errors';
import { requireAdminPrincipal } from './admin-access';

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  settingKeySchema.parse(key);
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);
  return parseStoredSetting(key, row?.value);
}

export async function updateSetting<Key extends SettingKey>(
  key: Key,
  value: Settings[Key],
  actor: Actor,
): Promise<{ data: { ok: true }; tags: string[] }> {
  const parsed = adminUpdateSettingSchema.safeParse({ key, value });
  if (!parsed.success) throw new AppError('VALIDATION');
  const input = parsed.data;
  const { dbPool } = await import('../../db/pool');
  await dbPool.transaction(async (tx) => {
    const principal = await requireAdminPrincipal(tx, actor);
    // Collection editors take collection then setting locks too: never reverse this order.
    if (input.key === 'home.hero' && input.value.collectionSlug) {
      const [collection] = await tx
        .select({ id: collections.id })
        .from(collections)
        .where(
          and(
            eq(collections.slug, input.value.collectionSlug),
            eq(collections.visibility, 'public'),
            inArray(collections.kind, ['editorial', 'seasonal']),
          ),
        )
        .for('share');
      if (!collection) throw new AppError('VALIDATION', 'Hero collection must be public');
    }
    // A missing row also needs serialization so two initial writes have an honest audit trail.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${'site-setting:' + input.key},0))`,
    );
    const [before] = await tx
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, input.key))
      .for('update');
    await tx
      .insert(siteSettings)
      .values({ key: input.key, value: input.value, updatedBy: principal.userId })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: input.value, updatedBy: principal.userId, updatedAt: new Date() },
      });
    await tx.insert(auditLog).values({
      actorId: principal.userId,
      action: 'settings.updated',
      entityType: 'setting',
      entityId: input.key,
      meta: { before: before?.value ?? null, after: input.value },
    });
  });
  return { data: { ok: true }, tags: [CacheTags.settings] };
}

export async function getFeatures(): Promise<FeaturesSetting> {
  return getSetting('features');
}
