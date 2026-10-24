import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { PublishQueue } from '@/components/admin/PublishQueue';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { adminPublishQuerySchema } from '@/lib/validation/admin-queries';

export const instant = false;
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function PublishContent({
  searchParams,
}: PageProps<'/[locale]/admin/publish'>): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  await requireAdminPage();
  const query = adminPublishQuerySchema.safeParse(await searchParams);
  if (!query.success) return <ErrorState code="VALIDATION" />;
  const { listAdminPublish } = await import('@/server/admin-queries/publish');
  return (
    <PublishQueue
      key={JSON.stringify(query.data)}
      initialPage={await listAdminPublish(query.data)}
      query={query.data}
    />
  );
}
export default async function AdminPublishPage(
  props: PageProps<'/[locale]/admin/publish'>,
): Promise<ReactElement> {
  const t = await getTranslations('admin.publish');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="5">
            <Skeleton h="48" rounded="card" />
            <Skeleton h="96" rounded="card" />
          </Stack>
        }
      >
        <PublishContent {...props} />
      </Suspense>
    </Stack>
  );
}
