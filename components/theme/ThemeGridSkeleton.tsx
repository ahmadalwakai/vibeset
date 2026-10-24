import { Box, SimpleGrid, Skeleton, Stack } from '@chakra-ui/react';
import type { ReactElement } from 'react';

export function ThemeGridSkeleton({ count = 10 }: { count?: number }): ReactElement {
  return (
    <SimpleGrid
      columns={{ base: 2, sm: 3, md: 4, xl: 5 }}
      gap={{ base: '3', md: '5' }}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <Box key={index}>
          <Box position="relative" aspectRatio={9 / 19.5} overflow="hidden" rounded="card">
            <Skeleton position="absolute" inset="0" rounded="card" />
          </Box>
          <Stack gap="2" p="3">
            <Skeleton h="4" w="4/5" />
            <Skeleton h="5" w="3/5" rounded="chip" />
          </Stack>
        </Box>
      ))}
    </SimpleGrid>
  );
}
