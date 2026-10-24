'use client';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import type { ThemeListQuery } from '@/lib/dto';
import {
  normalizeThemeListQuery,
  serializeThemeListQuery,
  themeListQuerySchema,
} from '@/lib/validation/themes';

export function exploreHref(query: ThemeListQuery): string {
  const search = serializeThemeListQuery(query);
  return `/explore${search ? `?${search}` : ''}`;
}
export function useExploreQuery(): {
  query: ThemeListQuery;
  update: (patch: Partial<ThemeListQuery>) => void;
  clear: () => void;
} {
  const params = useSearchParams();
  const router = useRouter();
  const query = normalizeThemeListQuery(params);
  return {
    query,
    update: (patch) => {
      const next = themeListQuerySchema.parse({
        ...query,
        ids: undefined,
        cursor: undefined,
        ...patch,
      });
      router.replace(exploreHref(next), { scroll: false });
    },
    clear: () => router.replace('/explore', { scroll: false }),
  };
}
