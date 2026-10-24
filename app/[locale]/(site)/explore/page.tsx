import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { FilterBar } from '@/components/explore/FilterBar';
import { InfiniteThemeGrid } from '@/components/explore/InfiniteThemeGrid';
import { ThemeGridSkeleton } from '@/components/theme/ThemeGridSkeleton';
import { redirect } from '@/i18n/navigation';
import {
  normalizeThemeListQuery,
  serializeThemeListQuery,
  themeListQuerySchema,
} from '@/lib/validation/themes';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
async function ExploreResults({
  searchParams,
  locale,
}: {
  searchParams: SearchParams;
  locale: 'en' | 'ar';
}): Promise<ReactElement> {
  await connection();
  const raw = await searchParams;
  const parsed = themeListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : normalizeThemeListQuery(raw);
  if (!parsed.success) {
    const serialized = serializeThemeListQuery(query);
    redirect({ href: `/explore${serialized ? `?${serialized}` : ''}`, locale });
  }
  const [{ listThemes }, { listTags }] = await Promise.all([
    import('@/server/queries/themes'),
    import('@/server/queries/taxonomy'),
  ]);
  const [initialPage, tags] = await Promise.all([listThemes(query), listTags()]);
  return (
    <Stack gap="8">
      <FilterBar tags={tags} />
      <InfiniteThemeGrid
        key={serializeThemeListQuery(query)}
        query={query}
        initialPage={initialPage}
        tags={tags}
      />
    </Stack>
  );
}
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('explore.metadata');
  return { title: t('title'), description: t('description') };
}
export default async function ExplorePage({
  searchParams,
  params,
}: {
  searchParams: SearchParams;
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const t = await getTranslations('explore');
  const locale = z.enum(['en', 'ar']).parse((await params).locale);
  return (
    <Stack gap="8" py={{ base: '8', md: '12' }}>
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="8">
            <Stack gap="5">
              <Skeleton h="12" rounded="full" />
              <Stack gap="4" display={{ base: 'none', md: 'flex' }}>
                {[0, 1, 2, 3, 4].map((index) => (
                  <Stack key={index} gap="2">
                    <Skeleton h="4" w="20" />
                    <Skeleton h="11" rounded="full" />
                  </Stack>
                ))}
              </Stack>
            </Stack>
            <ThemeGridSkeleton />
          </Stack>
        }
      >
        <ExploreResults searchParams={searchParams} locale={locale} />
      </Suspense>
    </Stack>
  );
}
