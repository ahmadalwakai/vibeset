import { Box, Button, HStack, Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { CatalogError } from '@/components/common/CatalogError';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { ThemeGrid } from '@/components/theme/ThemeGrid';
import { ThemeGridSkeleton } from '@/components/theme/ThemeGridSkeleton';
import { Link, redirect } from '@/i18n/navigation';
import type { CollectionDetailDTO } from '@/lib/dto';
import { localized } from '@/lib/utils/localized';
import { collectionCursorSchema, collectionSlugSchema } from '@/lib/validation/themes';

type Props = PageProps<'/[locale]/collections/[slug]'>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('explore.collections');
  return { title: t('detailTitle'), description: t('detailDescription') };
}

async function CollectionContent({ params, searchParams }: Props): Promise<ReactElement> {
  await connection();
  const [{ slug }, raw, locale, t, common] = await Promise.all([
    params,
    searchParams,
    getLocale(),
    getTranslations('explore.collections'),
    getTranslations('common.pagination'),
  ]);
  if (!collectionSlugSchema.safeParse(slug).success) notFound();
  const href = `/collections/${slug}`;
  const parsed = collectionCursorSchema.safeParse(raw.cursor);
  if (!parsed.success) return redirect({ href, locale });
  let collection: CollectionDetailDTO | null;
  try {
    const { getCollection } = await import('@/server/queries/collections');
    collection = await getCollection(slug, parsed.data);
  } catch {
    return <CatalogError />;
  }
  if (!collection) notFound();
  return (
    <Stack gap="8">
      <PageHeader
        eyebrow={t('detailTitle')}
        title={localized(collection, locale, 'title')}
        description={localized(collection, locale, 'description')}
      />
      {collection.items.items.length ? (
        <ThemeGrid themes={collection.items.items} priority />
      ) : (
        <EmptyState
          title={t('emptyItemsTitle')}
          description={t('emptyItemsDescription')}
          action={
            <Button asChild size="lg" colorPalette="brand">
              <Link href="/explore">{t('browse')}</Link>
            </Button>
          }
        />
      )}
      <HStack justify="space-between" gap="3" flexWrap="wrap">
        {parsed.data ? (
          <Button asChild variant="outline" size="lg">
            <Link href={href}>{common('first')}</Link>
          </Button>
        ) : (
          <Box />
        )}
        {collection.items.nextCursor ? (
          <Button asChild size="lg" colorPalette="brand">
            <Link href={{ pathname: href, query: { cursor: collection.items.nextCursor } }}>
              {common('next')}
            </Link>
          </Button>
        ) : null}
      </HStack>
    </Stack>
  );
}

export default function CollectionPage(props: Props): ReactElement {
  return (
    <Box py={{ base: '8', md: '12' }}>
      <Suspense
        fallback={
          <Stack gap="8">
            <Skeleton h="10" w="2/3" maxW="xl" />
            <Skeleton h="6" w="full" maxW="2xl" />
            <ThemeGridSkeleton />
          </Stack>
        }
      >
        <CollectionContent {...props} />
      </Suspense>
    </Box>
  );
}
