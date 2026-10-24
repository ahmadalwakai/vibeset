import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { ReviewDeck } from '@/components/admin/ReviewDeck';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { adminReviewQuerySchema } from '@/lib/validation/admin-queries';

export const instant = false;
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function ReviewContent({
  searchParams,
}: PageProps<'/[locale]/admin/review'>): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  await requireAdminPage();
  const query = adminReviewQuerySchema.safeParse(await searchParams);
  if (!query.success) return <ErrorState code="VALIDATION" />;
  const [{ listAdminReview }, { getAdminThemeOptions }] = await Promise.all([
    import('@/server/admin-queries/review'),
    import('@/server/admin-queries/themes'),
  ]);
  const [page, options] = await Promise.all([listAdminReview(query.data), getAdminThemeOptions()]);
  return (
    <ReviewDeck
      key={JSON.stringify([
        query.data,
        page.total,
        page.items.map((item) => [item.id, item.reviewVersion, item.updatedAt]),
      ])}
      initialPage={page}
      query={query.data}
      options={options}
    />
  );
}
export default async function AdminReviewPage(
  props: PageProps<'/[locale]/admin/review'>,
): Promise<ReactElement> {
  const t = await getTranslations('admin.review');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="5">
            <Skeleton h="11" />
            <Skeleton h="96" rounded="card" />
            <Skeleton h="11" />
          </Stack>
        }
      >
        <ReviewContent {...props} />
      </Suspense>
    </Stack>
  );
}
