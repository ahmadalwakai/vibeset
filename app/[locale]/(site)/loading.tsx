import { Box, Flex, Skeleton, Stack } from '@chakra-ui/react';
import type { ReactElement } from 'react';

export default function SiteLoading(): ReactElement {
  return (
    <Flex
      gap="12"
      direction={{ base: 'column', lg: 'row' }}
      py={{ base: '12', md: '20' }}
      aria-hidden="true"
    >
      <Stack gap="6" flex="1">
        <Skeleton h="5" w="40" rounded="chip" />
        <Skeleton h="14" w="full" maxW="xl" />
        <Skeleton h="14" w="3/4" />
        <Skeleton h="6" w="full" maxW="lg" />
        <Skeleton h="6" w="2/3" />
        <Flex gap="3">
          <Skeleton h="12" w="40" rounded="button" />
          <Skeleton h="12" w="32" rounded="button" />
        </Flex>
      </Stack>
      <Box>
        <Skeleton boxSize={{ base: '72', md: '96' }} rounded="full" />
      </Box>
    </Flex>
  );
}
