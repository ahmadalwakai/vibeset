'use client';

import { Button, Flex } from '@chakra-ui/react';
import type { ReactElement } from 'react';
import { PressScale } from '@/components/common/motion';
import { toaster } from '@/components/ui/toaster';

interface BootstrapActionsProps {
  brandLabel: string;
  peachLabel: string;
  successTitle: string;
  successDescription: string;
}

export function BootstrapActions({
  brandLabel,
  peachLabel,
  successTitle,
  successDescription,
}: BootstrapActionsProps): ReactElement {
  function showSuccess(): void {
    toaster.create({ type: 'success', title: successTitle, description: successDescription });
  }

  return (
    <Flex gap="3" wrap="wrap">
      <PressScale>
        <Button colorPalette="brand" rounded="full" size="lg" onClick={showSuccess}>
          {brandLabel}
        </Button>
      </PressScale>
      <PressScale>
        <Button colorPalette="peach" rounded="full" size="lg" onClick={showSuccess}>
          {peachLabel}
        </Button>
      </PressScale>
    </Flex>
  );
}
