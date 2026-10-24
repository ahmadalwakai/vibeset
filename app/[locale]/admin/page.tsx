import { pageMetadata } from '@/lib/seo';
import { Button, SimpleGrid, Skeleton, Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminAuditEntries } from '@/components/admin/AdminAuditEntries';
import { DownloadsChart } from '@/components/admin/DownloadsChart';
import { PageHeader } from '@/components/common/PageHeader';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';

// Private children are intentionally withheld by the session-owner gate during hydration.
export const instant = false;
async function authorize(): Promise<void> {
  await connection();
  await (await import('@/server/guards')).requireAdminPage();
}
async function Kpis(): Promise<ReactElement> {
  await authorize();
  const [{ getAdminDashboardKpis }, t, locale] = await Promise.all([
    import('@/server/admin-queries/dashboard'),
    getTranslations('admin.dashboard'),
    getLocale(),
  ]);
  const data = await getAdminDashboardKpis();
  const keys = [
    'published',
    'pendingReview',
    'approvedUnpublished',
    'stale',
    'downloadsToday',
    'downloads7d',
    'downloads30d',
    'newUsers7d',
    'openReports',
    'pendingCreators',
  ] as const;
  return (
    <SimpleGrid columns={{ base: 2, md: 3, xl: 5 }} gap="3">
      {keys.map((key) => (
        <Stack
          key={key}
          gap="2"
          p="4"
          bg="bg.panel"
          rounded="card"
          borderWidth="hairline"
          borderColor="border"
        >
          <Text textStyle="caption" color="fg.muted">
            {t(key)}
          </Text>
          <Text textStyle="display.lg" fontVariantNumeric="tabular-nums">
            {formatNumber(data[key], locale)}
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  );
}
async function Downloads(): Promise<ReactElement> {
  await authorize();
  const [{ getAdminDownloads }, t] = await Promise.all([
    import('@/server/admin-queries/dashboard'),
    getTranslations('admin.dashboard'),
  ]);
  return (
    <Stack gap="4">
      <Text as="h2" textStyle="heading.md">
        {t('downloadsChart')}
      </Text>
      <DownloadsChart data={await getAdminDownloads()} />
    </Stack>
  );
}
async function TopThemes(): Promise<ReactElement> {
  await authorize();
  const [{ getAdminTopThemes }, t, locale] = await Promise.all([
    import('@/server/admin-queries/dashboard'),
    getTranslations('admin.dashboard'),
    getLocale(),
  ]);
  const rows = await getAdminTopThemes();
  return (
    <Stack gap="3">
      <Text as="h2" textStyle="heading.md">
        {t('topThemes')}
      </Text>
      {rows.length ? (
        rows.map((row) => (
          <Button
            key={row.id}
            asChild
            variant="outline"
            minH="11"
            h="auto"
            py="3"
            justifyContent="space-between"
            whiteSpace="normal"
          >
            <Link href={`/admin/themes/${row.id}`}>
              <Text as="span" textAlign="start">
                {localized(row, locale)}
              </Text>
              <Text as="span" ms="3" fontVariantNumeric="tabular-nums">
                {formatNumber(row.downloads, locale)}
              </Text>
            </Link>
          </Button>
        ))
      ) : (
        <Text textStyle="body.sm" color="fg.muted">
          {t('noData')}
        </Text>
      )}
    </Stack>
  );
}
async function RecentAudit(): Promise<ReactElement> {
  await authorize();
  const [{ getAdminRecentAudit }, t] = await Promise.all([
    import('@/server/admin-queries/dashboard'),
    getTranslations('admin.dashboard'),
  ]);
  return (
    <Stack gap="4">
      <Text as="h2" textStyle="heading.md">
        {t('recentAudit')}
      </Text>
      <AdminAuditEntries entries={await getAdminRecentAudit()} />
    </Stack>
  );
}

export default async function AdminDashboardPage(): Promise<ReactElement> {
  const t = await getTranslations('admin.dashboard');
  return (
    <Stack gap="8">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense fallback={<Skeleton h="48" rounded="card" />}>
        <Kpis />
      </Suspense>
      <Suspense fallback={<Skeleton h="72" rounded="card" />}>
        <Downloads />
      </Suspense>
      <SimpleGrid columns={{ base: 1, xl: 2 }} gap="8">
        <Suspense fallback={<Skeleton h="96" rounded="card" />}>
          <TopThemes />
        </Suspense>
        <Suspense fallback={<Skeleton h="96" rounded="card" />}>
          <RecentAudit />
        </Suspense>
      </SimpleGrid>
    </Stack>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('admin.dashboard')]);
  return pageMetadata({
    locale,
    path: '/admin',
    title: t('title'),
    description: t('description'),
    noindex: true,
  });
}
