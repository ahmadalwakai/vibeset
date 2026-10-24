import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminTags } from '@/components/admin/AdminTags';
import { PageHeader } from '@/components/common/PageHeader';
export const instant = false;
async function Content(): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  const session = await requireAdminPage();
  const tags = await (await import('@/server/admin-queries/content')).listAdminTags();
  return <AdminTags key={`${session.user.id}:${JSON.stringify(tags)}`} tags={tags} />;
}
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.tags');
  return { title: t('title'), description: t('description') };
}
export default async function Page(): Promise<ReactElement> {
  const t = await getTranslations('admin.tags');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense fallback={<Skeleton h="96" rounded="card" />}>
        <Content />
      </Suspense>
    </Stack>
  );
}
