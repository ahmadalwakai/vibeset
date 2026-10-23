import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';
import { globalCss } from './global-css';
import { semanticTokens } from './semantic-tokens';
import { textStyles } from './text-styles';
import { tokens } from './tokens';

export const system = createSystem(
  defaultConfig,
  defineConfig({
    theme: { tokens, semanticTokens, textStyles },
    globalCss,
  }),
);
