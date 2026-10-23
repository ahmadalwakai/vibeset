import { Skeleton, Stack } from '@chakra-ui/react';
import type { ReactElement } from 'react';

export function SignInSkeleton(): ReactElement {
  return (
    <Stack gap="6" aria-hidden="true">
      <Skeleton h="8" w="3/4" />
      <Skeleton h="5" w="full" />
      <Skeleton h="12" rounded="button" />
      <Skeleton h="5" w="1/3" alignSelf="center" />
      <Skeleton h="12" rounded="input" />
      <Skeleton h="12" rounded="button" />
    </Stack>
  );
}
