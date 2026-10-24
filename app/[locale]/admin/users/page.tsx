import { Button, Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminUsers } from '@/components/admin/AdminUsers';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { Link } from '@/i18n/navigation';
import { adminUserQuerySchema } from '@/lib/validation/admin-moderation';

export const instant = false;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
async function Content({ searchParams }: { searchParams: SearchParams }): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  const principal = await requireAdminPage();
  const parsed = adminUserQuerySchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <Stack gap="4">
        <ErrorState code="VALIDATION" />
        <Button asChild minH="11">
          <Link href="/admin/users">{(await getTranslations('admin.users'))('clear')}</Link>
        </Button>
      </Stack>
    );
  const { listAdminUsers } = await import('@/server/admin-queries/users');
  const data = await listAdminUsers(parsed.data);
  return (
    <AdminUsers
      key={JSON.stringify(parsed.data)}
      data={data}
      query={parsed.data}
      adminId={principal.user.id}
    />
  );
}
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.users');
  return { title: t('title'), description: t('description') };
}
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactElement> {
  const t = await getTranslations('admin.users');
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
