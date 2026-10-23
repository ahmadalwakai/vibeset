'use client';

import { Container } from '@chakra-ui/react';
import type { ReactElement } from 'react';
import { ErrorState } from '@/components/common/ErrorState';

export default function LocaleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  return (
    <Container as="main" id="main" tabIndex={-1} maxW="container.xl" px="4" py="20">
      <ErrorState onRetry={reset} />
    </Container>
  );
}
