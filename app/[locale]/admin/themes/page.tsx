import { pageMetadata } from '@/lib/seo';
import { Button, Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminThemeFilters } from '@/components/admin/AdminThemeFilters';
import { AdminThemesTable } from '@/components/admin/AdminThemesTable';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { Link } from '@/i18n/navigation';
import { adminThemeListSchema } from '@/lib/validation/admin-queries';

// Private children are intentionally withheld by the session-owner gate during hydration.
export const instant = false;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
async function ThemesContent({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactElement> {
  await connection();
  const { requireAdminPage } = await import('@/server/guards');
  await requireAdminPage();
  const parsed = adminThemeListSchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <Stack gap="4">
        <ErrorState code="VALIDATION" />
        <Button asChild minH="11" alignSelf="start">
          <Link href="/admin/themes">
            {(await getTranslations('admin.themes'))('clearFilters')}
          </Link>
        </Button>
      </Stack>
    );
  const { listAdminThemes, getAdminThemeOptions } = await import('@/server/admin-queries/themes');
  const [data, options] = await Promise.all([listAdminThemes(parsed.data), getAdminThemeOptions()]);
  return (
    <Stack gap="6">
      <AdminThemeFilters query={parsed.data} options={options} />
      <AdminThemesTable
        key={JSON.stringify(parsed.data)}
        data={data}
        options={options}
        query={parsed.data}
      />
    </Stack>
  );
}

export default async function AdminThemesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactElement> {
  const t = await getTranslations('admin.themes');
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
        <ThemesContent searchParams={searchParams} />
      </Suspense>
    </Stack>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('admin.themes')]);
  return pageMetadata({
    locale,
    path: '/admin/themes',
    title: t('title'),
    description: t('description'),
    noindex: true,
  });
}
