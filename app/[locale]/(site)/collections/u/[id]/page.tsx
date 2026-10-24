import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { UserCollectionEditor } from '@/components/collections/UserCollectionEditor';
import { themeIdSchema } from '@/lib/theme-status';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('saved.collections');
  return {
    title: t('metadataTitle'),
    description: t('metadataDescription'),
    robots: { index: false, follow: false },
  };
}
async function CollectionContent({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  await connection();
  const { id } = await params,
    parsed = themeIdSchema.safeParse(id);
  if (!parsed.success) notFound();
  const { getUserCollection } = await import('@/server/admin-queries/collections');
  const collection = await getUserCollection(parsed.data);
  if (!collection) notFound();
  return (
    <Stack gap="7">
      <PageHeader title={collection.titleEn} />
      <UserCollectionEditor key={JSON.stringify(collection)} collection={collection} />
    </Stack>
  );
}
export default function UserCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): ReactElement {
  return (
    <Stack py={{ base: '8', md: '12' }}>
      <Suspense
        fallback={
          <Stack gap="5">
            <Skeleton h="12" w="2/3" />
            <Skeleton h="36" />
            {[0, 1, 2].map((value) => (
              <Skeleton key={value} h="20" />
            ))}
          </Stack>
        }
      >
        <CollectionContent params={params} />
      </Suspense>
    </Stack>
  );
}
