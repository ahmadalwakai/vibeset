'use client';
import { Box, Flex, Stack } from '@chakra-ui/react';
import type { ReactElement } from 'react';
import type { TagDTO } from '@/lib/dto';
import { ActiveFilters } from './ActiveFilters';
import { FilterFields } from './FilterFields';
import { FilterSheet } from './FilterSheet';
import { SearchInput } from './SearchInput';
import { SortMenu } from './SortMenu';
import { useExploreQuery } from './useExploreQuery';

export function FilterBar({ tags }: { tags: readonly TagDTO[] }): ReactElement {
  const { query, update } = useExploreQuery();
  return (
    <Stack gap="5">
      <Flex gap="3" direction={{ base: 'column', sm: 'row' }}>
        <SearchInput />
        <Flex gap="3" w={{ base: 'full', sm: 'auto' }} flexShrink="0">
          <Box display={{ base: 'block', md: 'none' }}>
            <FilterSheet tags={tags} query={query} onApply={update} />
          </Box>
          <SortMenu />
        </Flex>
      </Flex>
      <Box display={{ base: 'none', md: 'block' }}>
        <FilterFields tags={tags} query={query} onChange={update} />
      </Box>
      <ActiveFilters tags={tags} />
    </Stack>
  );
}
