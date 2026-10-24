import { pageMetadata } from '@/lib/seo';
import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { AdminThemeEditor } from '@/components/admin/AdminThemeEditor';
import { PageHeader } from '@/components/common/PageHeader';
import { themeIdSchema } from '@/lib/theme-status';

// Private children are intentionally withheld by the session-owner gate during hydration.
export const instant = false;
async function EditorContent({
  params,
}: PageProps<'/[locale]/admin/themes/[id]'>): Promise<ReactElement> {
  await connection();
  const id = themeIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const { requireAdminPage, getCreatorProfile } = await import('@/server/guards');
  const session = await requireAdminPage();
  const { getAdminTheme, getAdminThemeOptions } = await import('@/server/admin-queries/themes');
  const [theme, options, profile] = await Promise.all([
    getAdminTheme(id.data),
    getAdminThemeOptions(),
    getCreatorProfile(session.user.id),
  ]);
  if (!theme) notFound();
  return (
    <AdminThemeEditor
      key={`${session.user.id}:${theme.id}:${theme.updatedAt}`}
      theme={theme}
      options={options}
      actor={{ userId: session.user.id, isCreator: profile?.status === 'approved' }}
    />
  );
}

export default async function AdminThemeEditorPage(
  props: PageProps<'/[locale]/admin/themes/[id]'>,
): Promise<ReactElement> {
  const t = await getTranslations('admin.editor');
  return (
    <Stack gap="6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense fallback={<Skeleton h="96" rounded="card" />}>
        <EditorContent {...props} />
      </Suspense>
    </Stack>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  await connection();
  const id = themeIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const [locale, t] = await Promise.all([getLocale(), getTranslations('admin.editor')]);
  return pageMetadata({
    locale,
    path: '/admin/themes/' + id.data,
    title: t('title'),
    description: t('description'),
    noindex: true,
  });
}
