import { Button, Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminReports } from '@/components/admin/AdminReports';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { Link } from '@/i18n/navigation';
import { adminReportQuerySchema } from '@/lib/validation/admin-moderation';

export const instant = false;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
async function Content({ searchParams }: { searchParams: SearchParams }): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  const principal = await requireAdminPage();
  const parsed = adminReportQuerySchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <Stack gap="4">
        <ErrorState code="VALIDATION" />
        <Button asChild minH="11">
          <Link href="/admin/reports">{(await getTranslations('admin.reports'))('clear')}</Link>
        </Button>
      </Stack>
    );
  const { listAdminReports } = await import('@/server/admin-queries/reports');
  const data = await listAdminReports(parsed.data);
  return (
    <AdminReports
      key={JSON.stringify(parsed.data)}
      data={data}
      query={parsed.data}
      adminId={principal.user.id}
    />
  );
}
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.reports');
  return { title: t('title'), description: t('description') };
}
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactElement> {
  const t = await getTranslations('admin.reports');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="4">
            <Skeleton h="40" />
            <Skeleton h="96" />
          </Stack>
        }
      >
        <Content searchParams={searchParams} />
      </Suspense>
    </Stack>
  );
}
