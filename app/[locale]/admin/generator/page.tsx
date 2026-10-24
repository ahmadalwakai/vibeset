import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminGenerator } from '@/components/admin/AdminGenerator';
import { AdminGeneratorHistory } from '@/components/admin/AdminGeneratorHistory';
import { CatalogError } from '@/components/common/CatalogError';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { adminGenerationQuerySchema } from '@/lib/validation/admin-operations';
import type { AdminGeneratorOption, AdminGenerationRun } from '@/lib/admin-operations';
import type { AdminPage } from '@/lib/admin';

export const instant = false;
export const maxDuration = 60;
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function GeneratorContent({
  searchParams,
}: PageProps<'/[locale]/admin/generator'>): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  await requireAdminPage();
  const query = adminGenerationQuerySchema.safeParse(await searchParams);
  if (!query.success) return <ErrorState code="VALIDATION" />;
  let data: { options: AdminGeneratorOption[]; page: AdminPage<AdminGenerationRun> } | null = null;
  try {
    const { getAdminGeneratorOptions, listAdminGenerationRuns } =
      await import('@/server/admin-queries/generator');
    const [options, page] = await Promise.all([
      getAdminGeneratorOptions(),
      listAdminGenerationRuns(query.data),
    ]);
    data = { options, page };
  } catch (error) {
    unstable_rethrow(error);
    console.error({ scope: 'admin.generator.read', err: error });
  }
  if (!data) return <CatalogError />;
  return (
    <Stack gap="8">
      <AdminGenerator options={data.options} />
      <AdminGeneratorHistory page={data.page} query={query.data} options={data.options} />
    </Stack>
  );
}
export default async function AdminGeneratorPage(
  props: PageProps<'/[locale]/admin/generator'>,
): Promise<ReactElement> {
  const t = await getTranslations('admin.generator');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="5">
            <Skeleton h="80" rounded="card" />
            <Skeleton h="96" rounded="card" />
          </Stack>
        }
      >
        <GeneratorContent {...props} />
      </Suspense>
    </Stack>
  );
}
