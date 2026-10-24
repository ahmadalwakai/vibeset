import { createSystem, defineConfig } from '@chakra-ui/react';
import { defaultBaseConfig } from '@chakra-ui/react/preset-base';
import { baseConfig } from './base-config';
import { globalCss } from './global-css';
import { semanticTokens } from './semantic-tokens';
import { textStyles } from './text-styles';
import { tokens } from './tokens';

export const system = createSystem(
  defaultBaseConfig,
  baseConfig,
  defineConfig({
    theme: { tokens, semanticTokens, textStyles },
    globalCss,
  }),
);
