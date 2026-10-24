import { z } from 'zod';
import type { ThemeDetailDTO } from '../dto';
import { themeSpecSchema } from '../render/spec';
import { exportSlugSchema } from './icon-export';
import { themeCardSchema } from './themes';

const httpUrl = z.url({ protocol: /^https?$/ });
export const themeDetailSchema: z.ZodType<ThemeDetailDTO> = z.intersection(
  themeCardSchema,
  z.object({
    descriptionEn: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
    spec: themeSpecSchema,
    previewHomeUrl: httpUrl.nullable(),
    previewLockUrl: httpUrl.nullable(),
    ogUrl: httpUrl.nullable(),
    wallpapers: z
      .array(
        z.object({
          size: z.enum(['phone', 'tablet', 'desktop']),
          url: httpUrl,
          w: z.number().int().positive(),
          h: z.number().int().positive(),
          bytes: z.number().int().positive(),
        }),
      )
      .max(3)
      .refine((assets) => new Set(assets.map(({ size }) => size)).size === assets.length),
    remixOf: z
      .object({ slug: exportSlugSchema, nameEn: z.string(), nameAr: z.string().nullable() })
      .nullable(),
  }),
);
export const themeDetailResponseSchema = z.object({ data: themeDetailSchema });
