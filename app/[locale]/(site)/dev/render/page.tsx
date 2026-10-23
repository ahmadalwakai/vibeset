import { Skeleton, Stack } from '@chakra-ui/react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { RenderPlayground } from '@/components/dev/RenderPlayground';

export default async function RenderPlaygroundPage(): Promise<ReactElement> {
  if (process.env.NODE_ENV === 'production') notFound();
  const t = await getTranslations('common');
  return (
    <Suspense
      fallback={
        <Stack py="8" gap="5" aria-label={t('loading')}>
          <Skeleton h="12" w="2/3" />
          <Skeleton h="64" rounded="card" />
        </Stack>
      }
    >
      <RenderPlayground />
    </Suspense>
  );
}
