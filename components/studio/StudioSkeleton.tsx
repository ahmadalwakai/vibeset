import { SimpleGrid, Skeleton, Stack } from '@chakra-ui/react';
import type { ReactElement } from 'react';

export function StudioSkeleton(): ReactElement {
  return (
    <Stack gap="5" aria-hidden>
      <Skeleton h="12" rounded="button" />
      <SimpleGrid columns={{ base: 1, lg: 2 }} gap="6">
        <Skeleton h="96" rounded="card" />
        <Stack gap="4">
          <Skeleton h="11" />
          <Skeleton h="64" rounded="card" />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
