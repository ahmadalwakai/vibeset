import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminAuditLog } from '@/components/admin/AdminAuditLog';
import { CatalogError } from '@/components/common/CatalogError';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import type { AdminAuditEntry, AdminPage } from '@/lib/admin';
import { adminAuditQuerySchema } from '@/lib/validation/admin-operations';

export const instant = false;
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function AuditContent({
  searchParams,
}: PageProps<'/[locale]/admin/audit'>): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  await requireAdminPage();
  const query = adminAuditQuerySchema.safeParse(await searchParams);
  if (!query.success) return <ErrorState code="VALIDATION" />;
  let page: AdminPage<AdminAuditEntry> | null = null;
  try {
    page = await (await import('@/server/admin-queries/audit')).listAdminAudit(query.data);
  } catch (error) {
    unstable_rethrow(error);
    console.error({ scope: 'admin.audit.read', err: error });
  }
  return page ? <AdminAuditLog page={page} query={query.data} /> : <CatalogError />;
}
export default async function AdminAuditPage(
  props: PageProps<'/[locale]/admin/audit'>,
): Promise<ReactElement> {
  const t = await getTranslations('admin.audit');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="5">
            <Skeleton h="64" rounded="card" />
            <Skeleton h="96" rounded="card" />
          </Stack>
        }
      >
        <AuditContent {...props} />
      </Suspense>
    </Stack>
  );
}
