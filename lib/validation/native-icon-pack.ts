import { z } from 'zod';
import { appSlugSchema, exportSlugSchema } from './icon-export';

const digest = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/);
const publicPngUrl = z
  .string()
  .max(2048)
  .refine((value) => !/[\s\\]/u.test(value))
  .pipe(z.url({ protocol: /^https$/ }))
  .refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password && !url.search && !url.hash;
    } catch {
      return false;
    }
  });

export const nativeIconAssetSchema = z.strictObject({
  appSlug: appSlugSchema,
  name: z.string().min(1).max(120),
  aliases: z.array(z.string().max(120)).max(100),
  category: z.string().min(1).max(80),
  rank: z.number().int().nonnegative(),
  url: publicPngUrl,
  bytes: z
    .number()
    .int()
    .min(1)
    .max(2 * 1024 * 1024),
  w: z.literal(512),
  h: z.literal(512),
  sha256: digest,
});

export const nativeIconPackSchema = z
  .strictObject({
    version: z.literal(1),
    themeId: z.uuid().length(36),
    slug: exportSlugSchema,
    specHash: digest,
    icons: z.array(nativeIconAssetSchema).min(1).max(125),
  })
  .superRefine((pack, context) => {
    const seen = new Set<string>();
    let origin: string | undefined;
    for (const [index, icon] of pack.icons.entries()) {
      let url: URL;
      try {
        url = new URL(icon.url);
      } catch {
        continue;
      }
      const suffix = `/theme-packs/v1/${pack.specHash}/${icon.appSlug}-${icon.sha256}.png`;
      if (
        seen.has(icon.appSlug) ||
        !url.pathname.endsWith(suffix) ||
        (origin && origin !== url.origin)
      )
        context.addIssue({
          code: 'custom',
          path: ['icons', index],
          message: 'Invalid icon pack asset binding',
        });
      seen.add(icon.appSlug);
      origin = url.origin;
    }
  });

export const nativeIconPackResponseSchema = z.strictObject({ data: nativeIconPackSchema });
export type NativeIconPack = z.infer<typeof nativeIconPackSchema>;
export type NativeIconAsset = z.infer<typeof nativeIconAssetSchema>;
