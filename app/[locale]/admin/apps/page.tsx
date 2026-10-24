import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminApps } from '@/components/admin/AdminApps';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { adminAppListSchema } from '@/lib/validation/admin-content';
export const instant = false;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
async function Content({ searchParams }: Props): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  const session = await requireAdminPage();
  const parsed = adminAppListSchema.safeParse(await searchParams);
  if (!parsed.success) return <ErrorState code="VALIDATION" />;
  const data = await (await import('@/server/admin-queries/content')).listAdminApps(parsed.data);
  const { renderSampleSpec, playgroundStateSchema } = await import('@/content/render-sample');
  const sample = renderSampleSpec(playgroundStateSchema.parse({}));
  return (
    <AdminApps
      key={`${session.user.id}:${JSON.stringify(data)}`}
      data={data}
      sample={sample}
      q={parsed.data.q}
    />
  );
}
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.apps');
  return { title: t('title'), description: t('description') };
}
export default async function Page(props: Props): Promise<ReactElement> {
  const t = await getTranslations('admin.apps');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense fallback={<Skeleton h="96" rounded="card" />}>
        <Content {...props} />
      </Suspense>
    </Stack>
  );
}
