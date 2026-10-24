'use client';
import { Button, Flex, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { InfiniteSentinel } from '@/components/common/InfiniteSentinel';
import { TagChip } from '@/components/common/TagChip';
import { ThemeGrid } from '@/components/theme/ThemeGrid';
import { ThemeGridSkeleton } from '@/components/theme/ThemeGridSkeleton';
import { useInfiniteThemes } from '@/hooks/useInfiniteThemes';
import { Link } from '@/i18n/navigation';
import type { Paginated, TagDTO, ThemeCardDTO, ThemeListQuery } from '@/lib/dto';
import { exploreHref } from './useExploreQuery';

export interface InfiniteThemeGridProps {
  query: ThemeListQuery;
  initialPage: Paginated<ThemeCardDTO>;
  tags?: readonly TagDTO[];
}
export function InfiniteThemeGrid({
  query,
  initialPage,
  tags = [],
}: InfiniteThemeGridProps): ReactElement {
  const t = useTranslations('explore');
  const page = useInfiniteThemes({ query, initialPage });
  if (!page.items.length)
    return (
      <Stack gap="5">
        <EmptyState
          title={t('empty.title')}
          description={t('empty.description')}
          action={
            <Button asChild colorPalette="brand" size="lg">
              <Link href="/explore">{t('empty.clear')}</Link>
            </Button>
          }
        />
        <Text textStyle="heading.sm">{t('popularAesthetics')}</Text>
        <Flex gap="2" wrap="wrap">
          {tags
            .filter((tag) => tag.kind === 'aesthetic')
            .slice(0, 8)
            .map((tag) => (
              <TagChip
                key={tag.slug}
                tag={tag}
                href={exploreHref({ tags: [tag.slug], sort: 'trending', limit: 24 })}
              />
            ))}
        </Flex>
      </Stack>
    );
  return (
    <Stack gap="5" aria-busy={page.loading}>
      <ThemeGrid themes={page.items} priority />
      {page.loading ? <ThemeGridSkeleton count={5} /> : null}
      {page.error ? (
        <ErrorState code={page.error} onRetry={page.retry} retrying={page.loading} />
      ) : null}
      <InfiniteSentinel
        hasMore={page.hasMore}
        enabled={!page.error}
        loading={page.loading}
        onLoadMore={page.loadMore}
      />
    </Stack>
  );
}
