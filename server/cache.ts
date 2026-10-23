import 'server-only';

import { revalidateTag, updateTag } from 'next/cache';
import { z } from 'zod';

export { cacheLife, cacheTag } from 'next/cache';

export { CacheTags } from '../lib/cache-tags';

const invalidationSchema = z.object({
  tags: z.array(z.string().min(1).max(256)),
  mode: z.enum(['update', 'revalidate']),
});

export function invalidate(tags: readonly string[], mode: 'update' | 'revalidate'): void {
  const input = invalidationSchema.parse({ tags, mode });
  for (const tag of new Set(input.tags)) {
    if (input.mode === 'update') updateTag(tag);
    else revalidateTag(tag, 'max');
  }
}
