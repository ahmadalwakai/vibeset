'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { MotionConfig } from 'motion/react';
import type { ReactElement } from 'react';
import { system } from '@/design/system';
import { ColorModeProvider } from './color-mode';
import type { ColorModeProviderProps } from './color-mode';

export function Provider({ children, ...props }: ColorModeProviderProps): ReactElement {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...props}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </ColorModeProvider>
    </ChakraProvider>
  );
}
