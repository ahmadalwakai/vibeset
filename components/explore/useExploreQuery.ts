'use client';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import type { ThemeListQuery } from '@/lib/dto';
import {
  normalizeThemeListQuery,
  themeListQuerySchema,
  exploreHref,
} from '@/lib/validation/theme-query';

export { exploreHref } from '@/lib/validation/theme-query';
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
