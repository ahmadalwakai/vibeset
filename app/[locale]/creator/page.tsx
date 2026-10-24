import { Button, Flex, SimpleGrid, Skeleton, Stack, Text } from '@chakra-ui/react';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { CreatorThemeCard } from '@/components/creator/CreatorThemeCard';
import { Link } from '@/i18n/navigation';
import { THEME_STATUSES } from '@/lib/theme-status';
import { formatCompact, formatNumber } from '@/lib/utils/format';
import { creatorDashboardSchema } from '@/lib/validation/creator';

// The owner guard intentionally omits private children until the session resolves.
export const instant = false;

async function DashboardContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await connection();
  const raw = await searchParams;
  const parsed = creatorDashboardSchema.safeParse({ days: raw.days === '30' ? 30 : 7 });
  const [{ getCreatorDashboard, getMyCreatorContext }, t, status, locale] = await Promise.all([
    import('@/server/admin-queries/creator'),
    getTranslations('creator.dashboard'),
    getTranslations('creator.status'),
    getLocale(),
  ]);
  const [dashboard, profile] = await Promise.all([
    getCreatorDashboard(parsed.success ? parsed.data : { days: 7 }),
    getMyCreatorContext(),
  ]);
  return (
    <Stack gap="8">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button asChild colorPalette="brand" minH="11">
            <Link href="/creator/themes/new">{t('newTheme')}</Link>
          </Button>
        }
      />
      {profile?.status !== 'approved' ? (
        <Stack gap="3" p="4" bg="bg.subtle" rounded="card">
          <Text>{t('profileNeeded')}</Text>
          <Button asChild variant="outline" minH="11" alignSelf="start">
            <Link href="/become-creator">{t('apply')}</Link>
          </Button>
        </Stack>
      ) : null}
      <Flex gap="2">
        {([7, 30] as const).map((days) => (
          <Button
            key={days}
            asChild
            minH="11"
            variant={dashboard.days === days ? 'solid' : 'outline'}
            colorPalette="brand"
          >
            <Link
              href={{ pathname: '/creator', query: { days } }}
              aria-current={dashboard.days === days ? 'page' : undefined}
            >
              {t(days === 7 ? 'days7' : 'days30')}
            </Link>
          </Button>
        ))}
      </Flex>
      <SimpleGrid columns={{ base: 2, md: 3 }} gap="3">
        {(['views', 'downloads', 'iconExports', 'remixes', 'setupCompletions'] as const).map(
          (key) => (
            <Stack
              key={key}
              gap="2"
              p="4"
              rounded="card"
              bg="bg.panel"
              borderWidth="hairline"
              borderColor="border"
            >
              <Text textStyle="caption" color="fg.muted">
                {t(key)}
              </Text>
              <Text
                textStyle="display.lg"
                fontVariantNumeric="tabular-nums"
                aria-label={formatNumber(dashboard.stats[key], locale)}
              >
                {formatCompact(dashboard.stats[key], locale)}
              </Text>
            </Stack>
          ),
        )}
        <Stack
          gap="2"
          p="4"
          rounded="card"
          bg="bg.panel"
          borderWidth="hairline"
          borderColor="border"
        >
          <Text textStyle="caption" color="fg.muted">
            {t('currentFavorites')}
          </Text>
          <Text
            textStyle="display.lg"
            fontVariantNumeric="tabular-nums"
            aria-label={formatNumber(dashboard.currentFavorites, locale)}
          >
            {formatCompact(dashboard.currentFavorites, locale)}
          </Text>
          <Text textStyle="caption" color="fg.muted">
            {t('favoritesHint')}
          </Text>
        </Stack>
      </SimpleGrid>
      <Flex gap="2" flexWrap="wrap">
        {THEME_STATUSES.map((value) => (
          <Button key={value} asChild minH="11" variant="outline">
            <Link href={{ pathname: '/creator/themes', query: { status: value } }}>
              {status(value)} · {formatNumber(dashboard.counts[value], locale)}
            </Link>
          </Button>
        ))}
      </Flex>
      <Stack gap="4">
        <Text as="h2" textStyle="heading.md">
          {t('topThemes')}
        </Text>
        {dashboard.topThemes.length ? (
          <SimpleGrid columns={{ base: 1, xl: 2 }} gap="4">
            {dashboard.topThemes.map((theme) => (
              <CreatorThemeCard
                key={theme.id}
                theme={theme}
                canSubmit={profile?.status === 'approved'}
                actions={false}
              />
            ))}
          </SimpleGrid>
        ) : (
          <EmptyState
            title={t('noThemesTitle')}
            description={t('noThemesBody')}
            action={
              <Button asChild colorPalette="brand" minH="11">
                <Link href="/creator/themes/new">{t('newTheme')}</Link>
              </Button>
            }
          />
        )}
      </Stack>
      <Stack gap="4">
        <Text as="h2" textStyle="heading.md">
          {t('latestRejections')}
        </Text>
        {dashboard.latestRejections.length ? (
          <SimpleGrid columns={{ base: 1, xl: 2 }} gap="4">
            {dashboard.latestRejections.map((theme) => (
              <CreatorThemeCard
                key={theme.id}
                theme={theme}
                canSubmit={profile?.status === 'approved'}
              />
            ))}
          </SimpleGrid>
        ) : (
          <Text textStyle="body.sm" color="fg.muted">
            {t('noRejections')}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
export default function CreatorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): ReactElement {
  return (
    <Suspense
      fallback={
        <Stack gap="5">
          <Skeleton h="16" />
          <Skeleton h="64" />
          <Skeleton h="96" />
        </Stack>
      }
    >
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}
