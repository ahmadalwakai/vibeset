import { Button, Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminCreators } from '@/components/admin/AdminCreators';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { Link } from '@/i18n/navigation';
import { adminCreatorQuerySchema } from '@/lib/validation/admin-moderation';

export const instant = false;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
async function Content({ searchParams }: { searchParams: SearchParams }): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  await requireAdminPage();
  const parsed = adminCreatorQuerySchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <Stack gap="4">
        <ErrorState code="VALIDATION" />
        <Button asChild minH="11">
          <Link href="/admin/creators">{(await getTranslations('admin.creators'))('clear')}</Link>
        </Button>
      </Stack>
    );
  const { listAdminCreators } = await import('@/server/admin-queries/creators');
  const data = await listAdminCreators(parsed.data);
  return <AdminCreators key={JSON.stringify(parsed.data)} data={data} query={parsed.data} />;
}
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.creators');
  return { title: t('title'), description: t('description') };
}
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactElement> {
  const t = await getTranslations('admin.creators');
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
