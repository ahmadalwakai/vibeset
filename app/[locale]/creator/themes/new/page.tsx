import { pageMetadata } from '@/lib/seo';
import { randomInt } from 'node:crypto';
import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { CreatorThemeEditor } from '@/components/creator/CreatorThemeEditor';
import { StudioSkeleton } from '@/components/studio/StudioSkeleton';

// The owner guard intentionally omits private children until the session resolves.
export const instant = false;

async function NewThemeContent(): Promise<ReactElement> {
  await connection();
  const { requireCreatorPage } = await import('@/server/guards');
  const session = await requireCreatorPage();
  const [{ listTags }, { AESTHETICS }, { getPalette }, { buildSpec }, { createRng }] =
    await Promise.all([
      import('@/server/queries/taxonomy'),
      import('@/content/aesthetics'),
      import('@/content/palettes'),
      import('@/lib/render/build-spec'),
      import('@/lib/render/prng'),
    ]);
  const recipe = AESTHETICS[randomInt(AESTHETICS.length)];
  const paletteId = recipe?.palettes[randomInt(recipe.palettes.length)];
  const palette = paletteId ? getPalette(paletteId) : null;
  if (!recipe || !palette) throw new Error('No creator recipe available');
  return (
    <CreatorThemeEditor
      initialSpec={buildSpec(recipe, palette, createRng(randomInt(2_147_483_647)))}
      ownerId={session.user.id}
      canSubmit={session.creator?.status === 'approved'}
      tags={await listTags()}
    />
  );
}

export default async function NewCreatorThemePage(): Promise<ReactElement> {
  const t = await getTranslations('creator.editor');
  return (
    <Stack gap="6">
      <PageHeader title={t('titleNew')} description={t('description')} />
      <Suspense fallback={<StudioSkeleton />}>
        <NewThemeContent />
      </Suspense>
    </Stack>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('creator.editor')]);
  return pageMetadata({
    locale,
    path: '/creator/themes/new',
    title: t('titleNew'),
    description: t('description'),
    noindex: true,
  });
}
