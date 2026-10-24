import { z } from 'zod';
import { themeSpecSchema } from '../../lib/render/spec';
import originals from './originals.json';

export const nativeBetaOriginalSchema = z.strictObject({
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  nameEn: z.string().min(1).max(60),
  nameAr: z.string().min(1).max(60),
  descriptionEn: z.string().max(4000).nullable(),
  descriptionAr: z.string().max(4000).nullable(),
  spec: themeSpecSchema.refine(
    (spec) => spec.wallpaper.kind !== 'image' && spec.lockWallpaper?.kind !== 'image',
    'The initial beta contains self-contained generated originals only',
  ),
  specHash: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]+$/),
  previewHash: z
    .string()
    .length(16)
    .regex(/^[a-f0-9]+$/),
  tagSlugs: z
    .array(
      z
        .string()
        .min(2)
        .max(40)
        .regex(/^[a-z0-9-]+$/),
    )
    .min(1)
    .max(10),
});

export type NativeBetaOriginal = z.infer<typeof nativeBetaOriginalSchema>;

export const NATIVE_BETA_ORIGINALS: readonly NativeBetaOriginal[] = z
  .array(nativeBetaOriginalSchema)
  .length(3)
  .refine((rows) => new Set(rows.map((row) => row.slug)).size === rows.length)
  .refine((rows) => new Set(rows.map((row) => row.specHash)).size === rows.length)
  .parse(originals);

export const NATIVE_BETA_ACTOR = { kind: 'system', label: 'native-beta-originals' } as const;
