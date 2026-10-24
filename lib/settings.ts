import { z } from 'zod';

const announcementHrefSchema = z
  .string()
  .max(2048)
  .refine(
    (value) => {
      if (value !== value.trim() || /[\\\u0000-\u0020\u007f]/.test(value)) return false;
      try {
        if (value.startsWith('/')) {
          if (value.startsWith('//')) return false;
          const parsed = new URL(value, 'https://vibeset.invalid');
          if (parsed.origin !== 'https://vibeset.invalid') return false;

          let pathname = parsed.pathname;
          for (let count = 0; count < 6; count += 1) {
            const decoded = decodeURIComponent(pathname);
            if (/^\/{2}|[\\\u0000-\u0020\u007f]/.test(decoded)) return false;
            if (decoded === pathname) return true;
            pathname = decoded;
          }
          return false;
        }

        if (
          !/^https?:\/\//i.test(value) ||
          !z.url({ protocol: /^https?$/ }).safeParse(value).success
        )
          return false;
        const parsed = new URL(value);
        return parsed.username === '' && parsed.password === '';
      } catch {
        return false;
      }
    },
    { error: 'Must be an app-relative path or an HTTP(S) URL' },
  );

const announcementText = z
  .string()
  .max(560)
  .trim()
  .normalize()
  .max(280)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const settingsSchema = z.object({
  'home.hero': z.strictObject({
    collectionSlug: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .refine((value) => !/\s/.test(value))
      .nullable(),
  }),
  'home.announcement': z
    .strictObject({
      enabled: z.boolean(),
      textEn: announcementText,
      textAr: announcementText,
      href: announcementHrefSchema.nullable(),
      tone: z.enum(['info', 'celebrate', 'warning']),
    })
    .superRefine((value, context) => {
      if (value.enabled) {
        for (const key of ['textEn', 'textAr'] as const) {
          if (!value[key])
            context.addIssue({
              code: 'custom',
              path: [key],
              message: 'Enabled announcements require both languages',
            });
        }
      }
    }),
  features: z.strictObject({
    creatorApplicationsOpen: z.boolean(),
    uploadsEnabled: z.boolean(),
    reportsEnabled: z.boolean(),
  }),
});

export const settingSchemas = settingsSchema.shape;
export const settingKeySchema = settingsSchema.keyof();
export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;
export type FeaturesSetting = Settings['features'];

export const defaultSettings: Readonly<Settings> = Object.freeze({
  'home.hero': Object.freeze({ collectionSlug: null }),
  'home.announcement': Object.freeze({
    enabled: false,
    textEn: '',
    textAr: '',
    href: null,
    tone: 'info',
  }),
  features: Object.freeze({
    creatorApplicationsOpen: true,
    uploadsEnabled: true,
    reportsEnabled: true,
  }),
});

const schemas: { [Key in SettingKey]: z.ZodType<Settings[Key]> } = settingSchemas;

/** Stored JSON is independently fallible per key; never partially merge a broken setting. */
export function parseStoredSetting<Key extends SettingKey>(
  key: Key,
  value: unknown,
): Settings[Key] {
  settingKeySchema.parse(key);
  const parsed = schemas[key].safeParse(value);
  return parsed.success ? parsed.data : schemas[key].parse(defaultSettings[key]);
}
