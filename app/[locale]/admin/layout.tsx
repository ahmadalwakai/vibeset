import { Badge, Button, Flex, Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { PublishQueueProvider } from '@/components/admin/PublishQueueProvider';
import { AdminShell } from '@/components/layout/AdminShell';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/utils/format';

export const metadata: Metadata = { robots: { index: false, follow: false } };
async function AdminBadges(): Promise<ReactElement> {
  await connection();
  const [{ getAdminCounts }, t, locale] = await Promise.all([
    import('@/server/admin-queries/counts'),
    getTranslations('admin.nav'),
    getLocale(),
  ]);
  const counts = await getAdminCounts();
  return (
    <Flex gap="2" flexWrap="wrap" pb="3">
      {(
        [
          { key: 'review', count: counts.pendingReview },
          { key: 'reports', count: counts.openReports },
          { key: 'creators', count: counts.pendingCreators },
        ] as const
      ).map((item) => (
        <Button key={item.key} asChild variant="ghost" minH="11" size="sm">
          <Link href={`/admin/${item.key}`}>
            {t(item.key)}
            <Badge colorPalette="brand">{formatNumber(item.count, locale)}</Badge>
          </Link>
        </Button>
      ))}
    </Flex>
  );
}
async function AdminContent({ children }: { children: ReactNode }): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  const session = await requireAdminPage();
  return (
    <PublishQueueProvider ownerId={session.user.id}>
      <AdminShell
        badges={
          <Suspense fallback={<Skeleton h="11" mb="3" />}>
            <AdminBadges />
          </Suspense>
        }
      >
        {children}
      </AdminShell>
    </PublishQueueProvider>
  );
}
export default function AdminLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <Suspense
      fallback={
        <Stack p="6" gap="6">
          <Skeleton h="16" />
          <Skeleton h="96" />
        </Stack>
      }
    >
      <AdminContent>{children}</AdminContent>
    </Suspense>
  );
}
