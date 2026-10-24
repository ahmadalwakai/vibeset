import { pageMetadata } from '@/lib/seo';
import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { CreatorThemeEditor } from '@/components/creator/CreatorThemeEditor';
import { StudioSkeleton } from '@/components/studio/StudioSkeleton';
import { themeIdSchema } from '@/lib/theme-status';

// The owner guard intentionally omits private children until the session resolves.
export const instant = false;

async function EditThemeContent({
  params,
}: PageProps<'/[locale]/creator/themes/[id]'>): Promise<ReactElement> {
  await connection();
  const id = themeIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const { requireCreatorPage } = await import('@/server/guards');
  const session = await requireCreatorPage();
  const [{ getMyCreatorTheme }, { listTags }] = await Promise.all([
    import('@/server/admin-queries/creator'),
    import('@/server/queries/taxonomy'),
  ]);
  const [theme, tags] = await Promise.all([getMyCreatorTheme(id.data), listTags()]);
  if (!theme) notFound();
  return (
    <CreatorThemeEditor
      initialSpec={theme.spec}
      theme={theme}
      ownerId={session.user.id}
      canSubmit={session.creator?.status === 'approved'}
      tags={tags}
    />
  );
}

export default async function EditCreatorThemePage(
  props: PageProps<'/[locale]/creator/themes/[id]'>,
): Promise<ReactElement> {
  const t = await getTranslations('creator.editor');
  return (
    <Stack gap="6">
      <PageHeader title={t('titleEdit')} description={t('description')} />
      <Suspense fallback={<StudioSkeleton />}>
        <EditThemeContent {...props} />
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
  const [locale, t] = await Promise.all([getLocale(), getTranslations('creator.editor')]);
  return pageMetadata({
    locale,
    path: '/creator/themes/' + id.data,
    title: t('titleEdit'),
    description: t('description'),
    noindex: true,
  });
}
