import { z } from 'zod';
import type { AppDTO } from '../dto';
import { MAX_CUSTOM_ICONS, MAX_SELECTED_APPS } from '../icon-export';
import type { CustomIcon, IconSelection } from '../icon-export';

export const exportSlugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .refine((value) => !/\s/.test(value));
export const appSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .refine((value) => !/\s/.test(value));
export const glyphNameSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9-]+$/)
  .refine((value) => !/\s/.test(value));
const customIdSchema = z
  .string()
  .length(43)
  .toLowerCase()
  .startsWith('custom-')
  .refine((value) => z.uuid().safeParse(value.slice(7)).success);
export const customIconSchema: z.ZodType<CustomIcon> = z.strictObject({
  id: customIdSchema,
  label: z
    .string()
    .trim()
    .normalize()
    .min(1)
    .max(24)
    .refine((value) => !/\p{Cc}/u.test(value)),
  glyph: glyphNameSchema,
});
export const appDtoSchema: z.ZodType<AppDTO> = z.object({
  slug: appSlugSchema,
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().max(120)).max(100),
  category: z.string().min(1).max(80),
  glyph: glyphNameSchema,
  rank: z.number().int().nonnegative(),
});
export const appCatalogSchema = z
  .array(appDtoSchema)
  .max(5000)
  .refine((apps) => new Set(apps.map(({ slug }) => slug)).size === apps.length);
export const iconSelectionSchema: z.ZodType<IconSelection> = z
  .strictObject({
    v: z.literal(1),
    appSlugs: z
      .array(appSlugSchema)
      .max(500)
      .transform((slugs) => [...new Set(slugs)])
      .refine((slugs) => slugs.length <= MAX_SELECTED_APPS),
    custom: z
      .array(customIconSchema)
      .max(MAX_CUSTOM_ICONS)
      .refine((icons) => new Set(icons.map(({ id }) => id)).size === icons.length),
  })
  .refine(({ appSlugs, custom }) => !custom.some(({ id }) => appSlugs.includes(id)));
