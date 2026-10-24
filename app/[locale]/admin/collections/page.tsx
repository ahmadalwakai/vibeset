import { pageMetadata } from '@/lib/seo';
import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminCollections } from '@/components/admin/AdminCollections';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { adminCollectionListSchema } from '@/lib/validation/admin-content';
export const instant = false;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
async function Content({ searchParams }: Props): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  const session = await requireAdminPage();
  const parsed = adminCollectionListSchema.safeParse(await searchParams);
  if (!parsed.success) return <ErrorState code="VALIDATION" />;
  const data = await (
    await import('@/server/admin-queries/content')
  ).listAdminCollections(parsed.data);
  return (
    <AdminCollections
      key={`${session.user.id}:${JSON.stringify(data)}`}
      data={data}
      q={parsed.data.q}
    />
  );
}

export default async function Page(props: Props): Promise<ReactElement> {
  const t = await getTranslations('admin.collections');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense fallback={<Skeleton h="96" rounded="card" />}>
        <Content {...props} />
      </Suspense>
    </Stack>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('admin.collections')]);
  return pageMetadata({
    locale,
    path: '/admin/collections',
    title: t('title'),
    description: t('description'),
    noindex: true,
  });
}
