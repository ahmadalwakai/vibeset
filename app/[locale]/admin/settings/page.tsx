import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { CatalogError } from '@/components/common/CatalogError';
import { PageHeader } from '@/components/common/PageHeader';
import type { AdminHeroOption } from '@/lib/admin-operations';
import type { Settings } from '@/lib/settings';

export const instant = false;
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function SettingsContent(): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  await requireAdminPage();
  let data: { settings: Settings; heroOptions: AdminHeroOption[] } | null = null;
  try {
    const { getAdminSettings, getAdminHeroOptions } =
      await import('@/server/admin-queries/settings');
    const [settings, heroOptions] = await Promise.all([getAdminSettings(), getAdminHeroOptions()]);
    data = { settings, heroOptions };
  } catch (error) {
    unstable_rethrow(error);
    console.error({ scope: 'admin.settings.read', err: error });
  }
  return data ? (
    <AdminSettings initial={data.settings} heroOptions={data.heroOptions} />
  ) : (
    <CatalogError />
  );
}
export default async function AdminSettingsPage(): Promise<ReactElement> {
  const t = await getTranslations('admin.settings');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="5">
            <Skeleton h="64" rounded="card" />
            <Skeleton h="96" rounded="card" />
            <Skeleton h="64" rounded="card" />
          </Stack>
        }
      >
        <SettingsContent />
      </Suspense>
    </Stack>
  );
}
