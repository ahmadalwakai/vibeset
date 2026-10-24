'use client';

import { Link as ChakraLink, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { CreateCollectionButton } from '@/components/collections/CreateCollectionButton';
import { ErrorState } from '@/components/common/ErrorState';
import { Link } from '@/i18n/navigation';
import type { UserCollectionSummary } from '@/lib/collections';
import type { ErrorMessageCode } from '@/lib/result';
import { listCollections } from '@/server/actions/collections';
import { SavedLoading } from './SavedTabs';

export function SavedCollections(): ReactElement {
  const t = useTranslations('saved');
  const [rows, setRows] = useState<UserCollectionSummary[] | null>(null);
  const [failure, setFailure] = useState<ErrorMessageCode | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void listCollections({})
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setRows(result.data.collections);
          setFailure(null);
        } else setFailure(result.error.code);
      })
      .catch(() => {
        if (active) setFailure('NETWORK');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (failure)
    return (
      <ErrorState
        code={failure}
        onRetry={() => {
          setFailure(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  if (!rows) return <SavedLoading />;
  const create = (
    <CreateCollectionButton
      onCreated={(collection) => setRows((existing) => [collection, ...(existing ?? [])])}
    />
  );
  if (!rows.length)
    return (
      <EmptyState
        title={t('emptyCollectionsTitle')}
        description={t('emptyCollectionsBody')}
        action={create}
      />
    );
  return (
    <Stack gap="5">
      {create}
      <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap="4">
        {rows.map((collection) => (
          <Stack
            key={collection.id}
            gap="3"
            p="5"
            bg="bg.panel"
            rounded="card"
            borderWidth="hairline"
            borderColor="border"
          >
            <ChakraLink asChild minH="11" textStyle="heading.sm" color="brand.fg">
              <Link href={`/collections/u/${collection.id}`}>{collection.titleEn}</Link>
            </ChakraLink>
            <Text textStyle="body.sm" color="fg.muted">
              {t('collections.itemCount', { count: collection.itemCount })}
            </Text>
            <Text textStyle="caption" color="fg.muted">
              {t(`collections.${collection.visibility}`)}
            </Text>
          </Stack>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
