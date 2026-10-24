import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminCollectionEditor } from '@/components/admin/AdminCollectionEditor';
import { PageHeader } from '@/components/common/PageHeader';
import { themeIdSchema } from '@/lib/theme-status';
export const instant = false;
type Props = { params: Promise<{ locale: string; id: string }> };
async function Content({ params }: Props): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  const session = await requireAdminPage();
  const parsed = themeIdSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const collection = await (
    await import('@/server/admin-queries/content')
  ).getAdminCollection(parsed.data);
  if (!collection) notFound();
  return (
    <AdminCollectionEditor key={`${session.user.id}:${collection.id}`} collection={collection} />
  );
}
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.collections');
  return { title: t('edit'), description: t('description') };
}
export default async function Page(props: Props): Promise<ReactElement> {
  const t = await getTranslations('admin.collections');
  return (
    <Stack gap="6">
      <PageHeader title={t('edit')} />
      <Suspense fallback={<Skeleton h="96" rounded="card" />}>
        <Content {...props} />
      </Suspense>
    </Stack>
  );
}
