import 'server-only';

import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from '../../db/index';
import { siteSettings } from '../../db/schema/system';
import { defaultSettings, settingKeySchema, settingSchemas } from '../../lib/settings';
import type { FeaturesSetting, SettingKey, Settings } from '../../lib/settings';

const schemas: { [Key in SettingKey]: z.ZodType<Settings[Key]> } = settingSchemas;

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  settingKeySchema.parse(key);
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);
  const schema = schemas[key];
  const parsed = schema.safeParse(row?.value);
  return parsed.success ? parsed.data : schema.parse(defaultSettings[key]);
}

export async function getFeatures(): Promise<FeaturesSetting> {
  return getSetting('features');
}
