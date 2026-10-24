import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import { Button, Flex, SimpleGrid, Skeleton, Stack, Text } from '@chakra-ui/react';
import { connection } from 'next/server';
import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { CreatorThemeCard } from '@/components/creator/CreatorThemeCard';
import { Link } from '@/i18n/navigation';
import { THEME_STATUSES } from '@/lib/theme-status';
import { listCreatorThemesSchema } from '@/lib/validation/creator';

// The owner guard intentionally omits private children until the session resolves.
export const instant = false;

async function ThemesContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await connection();
  const raw = await searchParams;
  const parsed = listCreatorThemesSchema.safeParse({ status: raw.status, cursor: raw.cursor });
  const query = parsed.success ? parsed.data : {};
  const [{ listMyCreatorThemes, getMyCreatorContext }, t, status] = await Promise.all([
    import('@/server/admin-queries/creator'),
    getTranslations('creator.themes'),
    getTranslations('creator.status'),
  ]);
  const [page, profile] = await Promise.all([listMyCreatorThemes(query), getMyCreatorContext()]);
  const canSubmit = profile?.status === 'approved';
  return (
    <Stack gap="6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button asChild colorPalette="brand" minH="11">
            <Link href="/creator/themes/new">{t('newTheme')}</Link>
          </Button>
        }
      />
      <Flex as="nav" aria-label={t('filterLabel')} gap="2" overflowX="auto" pb="2">
        <Button
          asChild
          minH="11"
          flexShrink="0"
          variant={!query.status ? 'solid' : 'outline'}
          colorPalette="brand"
        >
          <Link href="/creator/themes" aria-current={!query.status ? 'page' : undefined}>
            {t('all')}
          </Link>
        </Button>
        {THEME_STATUSES.map((value) => (
          <Button
            key={value}
            asChild
            minH="11"
            flexShrink="0"
            variant={query.status === value ? 'solid' : 'outline'}
            colorPalette="brand"
          >
            <Link
              href={{ pathname: '/creator/themes', query: { status: value } }}
              aria-current={query.status === value ? 'page' : undefined}
            >
              {status(value)}
            </Link>
          </Button>
        ))}
      </Flex>
      {!canSubmit ? (
        <Text textStyle="body.sm" color="fg.muted">
          {t('submitNeedsProfile')} <Link href="/become-creator">{t('profileApplication')}</Link>
        </Text>
      ) : null}
      {page.items.length ? (
        <SimpleGrid columns={{ base: 1, xl: 2 }} gap="4">
          {page.items.map((theme) => (
            <CreatorThemeCard key={theme.id} theme={theme} canSubmit={canSubmit} />
          ))}
        </SimpleGrid>
      ) : (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <Button asChild minH="11" colorPalette="brand">
              <Link href="/creator/themes/new">{t('newTheme')}</Link>
            </Button>
          }
        />
      )}
      {page.nextCursor ? (
        <Button asChild minH="11" variant="outline" alignSelf="center">
          <Link
            href={{
              pathname: '/creator/themes',
              query: { ...(query.status ? { status: query.status } : {}), cursor: page.nextCursor },
            }}
          >
            {t('loadMore')}
          </Link>
        </Button>
      ) : null}
    </Stack>
  );
}
export default function CreatorThemesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): ReactElement {
  return (
    <Suspense
      fallback={
        <Stack gap="5">
          <Skeleton h="16" />
          <Skeleton h="12" />
          <Skeleton h="96" />
        </Stack>
      }
    >
      <ThemesContent searchParams={searchParams} />
    </Suspense>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('creator.themes')]);
  return pageMetadata({
    locale,
    path: '/creator/themes',
    title: t('title'),
    description: t('description'),
    noindex: true,
  });
}
