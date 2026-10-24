import { z } from 'zod';
import { CacheTags } from '../../lib/cache-tags';
import { originSchema } from './environment';

export async function refreshE2eCaches(input: {
  baseURL: string;
  secret: string;
  bypass?: string;
  preflight?: boolean;
}): Promise<void> {
  const response = await fetch(
    new URL('/api/internal/revalidate', originSchema.parse(input.baseURL)),
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        authorization: `Bearer ${z.string().min(32).parse(input.secret)}`,
        'content-type': 'application/json',
        ...(input.bypass ? { 'x-vercel-protection-bypass': input.bypass } : {}),
      },
      body: JSON.stringify({
        tags: input.preflight
          ? []
          : [
              CacheTags.themes,
              CacheTags.taxonomy,
              CacheTags.apps,
              CacheTags.settings,
              CacheTags.collections,
            ],
      }),
    },
  );
  if (!response.ok) throw new Error('E2E cache refresh authorization failed');
}
