'use client';
import { Flex, NativeSelect, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { THEME_SORTS } from '@/lib/validation/themes';
import { useExploreQuery } from './useExploreQuery';

export function SortMenu(): ReactElement {
  const t = useTranslations('explore');
  const { query, update } = useExploreQuery();
  if (query.q)
    return (
      <Flex minH="12" align="center" px="3" minW="0" flex={{ base: '1', sm: 'none' }}>
        <Text role="status" textStyle="body.sm" color="fg.muted">
          {t('sortLabel')}: {t('sort.relevance')}
        </Text>
      </Flex>
    );
  return (
    <NativeSelect.Root
      size="lg"
      w={{ base: 'auto', sm: '48' }}
      minW="0"
      flex={{ base: '1', sm: 'none' }}
    >
      <NativeSelect.Field
        aria-label={t('sortLabel')}
        value={query.sort}
        onChange={(event) => {
          const sort = THEME_SORTS.find((value) => value === event.target.value);
          if (sort) update({ sort });
        }}
      >
        {THEME_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {t(`sort.${sort}`)}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}
