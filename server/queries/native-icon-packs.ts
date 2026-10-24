import 'server-only';

import { z } from 'zod';
import prepared from '../../content/native-beta/icon-packs.json';
import { specHash } from '../../lib/render/hash';
import { nativeIconPackSchema, type NativeIconPack } from '../../lib/validation/native-icon-pack';
import { CacheTags, cacheLife, cacheTag } from '../cache';
import { publicSlugSchema } from '../public-api';
import { cdnUrl } from '../storage/urls';
import { getThemeDetail } from './themes';

/** Prepared packs are public only while their exact current theme is published. */
export async function getNativeIconPack(slug: string): Promise<NativeIconPack | null> {
  'use cache';
  cacheLife('hours');
  const validSlug = publicSlugSchema.parse(slug);
  cacheTag(CacheTags.themes, CacheTags.theme(validSlug));
  const theme = await getThemeDetail(validSlug);
  if (!theme) return null;
  const pack = z
    .array(nativeIconPackSchema)
    .max(3)
    .parse(prepared)
    .find((candidate) => candidate.themeId === theme.id && candidate.slug === theme.slug);
  if (!pack || pack.specHash !== (await specHash(theme.spec))) return null;
  return nativeIconPackSchema.parse({
    ...pack,
    icons: pack.icons.map((icon) => ({
      ...icon,
      url: cdnUrl(new URL(icon.url).pathname.slice(1)),
    })),
  });
}
