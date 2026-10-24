import { pageMetadata } from '@/lib/seo';
import { Box, Button, SimpleGrid, Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { CatalogError } from '@/components/common/CatalogError';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { CollectionCard } from '@/components/theme/CollectionCard';
import { Link } from '@/i18n/navigation';
import type { CollectionCardDTO } from '@/lib/dto';

async function CollectionsContent(): Promise<ReactElement> {
  await connection();
  const t = await getTranslations('explore.collections');
  let collections: CollectionCardDTO[];
  try {
    const { listPublicCollections } = await import('@/server/queries/collections');
    collections = await listPublicCollections();
  } catch {
    return <CatalogError />;
  }
  if (!collections.length)
    return (
      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        action={
          <Button asChild size="lg" colorPalette="brand">
            <Link href="/explore">{t('browse')}</Link>
          </Button>
        }
      />
    );
  return (
    <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap="5">
      {collections.map((collection) => (
        <CollectionCard key={collection.id} collection={collection} />
      ))}
    </SimpleGrid>
  );
}

export default async function CollectionsPage(): Promise<ReactElement> {
  const t = await getTranslations('explore.collections');
  return (
    <Stack gap="8" py={{ base: '8', md: '12' }}>
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap="5" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <Box key={index}>
                <Box position="relative" aspectRatio={3 / 2} overflow="hidden" rounded="card">
                  <Skeleton position="absolute" inset="0" rounded="card" />
                </Box>
                <Skeleton h="6" w="2/3" mt="4" />
              </Box>
            ))}
          </SimpleGrid>
        }
      >
        <CollectionsContent />
      </Suspense>
    </Stack>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations('explore.collections.metadata'),
  ]);
  return pageMetadata({
    locale,
    path: '/collections',
    title: t('title'),
    description: t('description'),
    noindex: false,
  });
}
