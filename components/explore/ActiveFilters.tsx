'use client';
import { Button, Flex } from '@chakra-ui/react';
import { XIcon } from '@phosphor-icons/react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { TagDTO } from '@/lib/dto';
import { localized } from '@/lib/utils/localized';
import { useExploreQuery } from './useExploreQuery';

export function ActiveFilters({ tags }: { tags: readonly TagDTO[] }): ReactElement | null {
  const t = useTranslations('explore');
  const locale = useLocale();
  const { query, update, clear } = useExploreQuery();
  const filters = [
    ...(query.q ? [{ key: 'q', name: query.q, remove: () => update({ q: undefined }) }] : []),
    ...(query.tags ?? []).map((slug) => ({
      key: `tag:${slug}`,
      name: localized(tags.find((tag) => tag.slug === slug) ?? { nameEn: slug }, locale),
      remove: () => update({ tags: query.tags?.filter((value) => value !== slug) }),
    })),
    ...(query.color
      ? [
          {
            key: 'color',
            name: t(`colors.${query.color}`),
            remove: () => update({ color: undefined }),
          },
        ]
      : []),
  ];
  if (!filters.length) return null;
  return (
    <Flex role="group" gap="2" wrap="wrap" align="center" aria-label={t('activeFilters')}>
      {filters.map((filter) => (
        <Button
          key={filter.key}
          size="sm"
          minH="11"
          rounded="full"
          variant="subtle"
          aria-label={t('removeFilter', { name: filter.name })}
          onClick={filter.remove}
        >
          {filter.name}
          <XIcon aria-hidden />
        </Button>
      ))}
      <Button variant="plain" size="sm" minH="11" onClick={clear}>
        {t('clearAll')}
      </Button>
    </Flex>
  );
}
