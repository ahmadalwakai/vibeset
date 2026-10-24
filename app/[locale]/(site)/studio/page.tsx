import { randomInt } from 'node:crypto';
import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { StudioEntry } from '@/components/studio/StudioEntry';
import { StudioSkeleton } from '@/components/studio/StudioSkeleton';
import type { StudioEntryProps } from '@/lib/studio-entry';
import { parseStudioEntryQuery } from '@/lib/validation/studio-entry';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function StudioContent({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactElement> {
  await connection();
  const raw = await searchParams;
  const parsed = parseStudioEntryQuery(raw);
  const [{ AESTHETICS }, { getPalette }, { buildSpec }, { createRng }] = await Promise.all([
    import('@/content/aesthetics'),
    import('@/content/palettes'),
    import('@/lib/render/build-spec'),
    import('@/lib/render/prng'),
  ]);
  const recipe = AESTHETICS[randomInt(AESTHETICS.length)];
  if (!recipe) throw new Error('No Studio recipe available');
  const paletteId = recipe.palettes[randomInt(recipe.palettes.length)];
  const palette = paletteId ? getPalette(paletteId) : undefined;
  if (!palette) throw new Error('No Studio palette available');
  const entry: StudioEntryProps = {
    initialSpec: buildSpec(recipe, palette, createRng(randomInt(2_147_483_647))),
    source: null,
    sourceSlug: null,
    initialRemix: null,
    explicit: parsed.kind !== 'draft',
    entryError: parsed.kind === 'invalid' ? 'invalidLink' : null,
  };
  if (parsed.kind === 'share') {
    const { decodeStudioShare } = await import('@/lib/client/studio-share');
    const spec = await decodeStudioShare(parsed.value);
    if (spec) entry.initialSpec = spec;
    else entry.entryError = 'invalidLink';
  } else if (parsed.kind === 'remix') {
    const [{ requireUserPage }, { getMyRemix }] = await Promise.all([
      import('@/server/guards'),
      import('@/server/admin-queries/user'),
    ]);
    const session = await requireUserPage(`/studio?remix=${parsed.id}`);
    const remix = await getMyRemix(parsed.id);
    if (!remix) notFound();
    entry.initialSpec = remix.spec;
    entry.initialRemix = { id: remix.id, nameEn: remix.nameEn, ownerId: session.user.id };
  } else if (parsed.kind === 'from') {
    try {
      const { getThemeDetail } = await import('@/server/queries/themes');
      const theme = await getThemeDetail(parsed.slug);
      if (theme) {
        entry.initialSpec = theme.spec;
        entry.sourceSlug = theme.slug;
        entry.source = {
          id: theme.id,
          slug: theme.slug,
          nameEn: theme.nameEn,
          nameAr: theme.nameAr,
        };
      } else entry.entryError = 'themeUnavailable';
    } catch {
      entry.entryError = 'themeUnavailable';
    }
  }
  return <StudioEntry {...entry} />;
}
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('studio'), getLocale()]);
  const raw = await searchParams;
  return pageMetadata({
    locale,
    path: '/studio',
    title: t('title'),
    description: t('description'),
    noindex: raw.s !== undefined || raw.remix !== undefined,
    follow: true,
  });
}
export default async function StudioPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactElement> {
  const t = await getTranslations('studio');
  return (
    <Stack gap="6" py={{ base: '6', md: '10' }}>
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense fallback={<StudioSkeleton />}>
        <StudioContent searchParams={searchParams} />
      </Suspense>
    </Stack>
  );
}
