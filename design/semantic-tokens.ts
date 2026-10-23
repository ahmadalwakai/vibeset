import { defineSemanticTokens } from '@chakra-ui/react';

export const semanticTokens = defineSemanticTokens({
  colors: {
    bg: {
      DEFAULT: {
        value: {
          base: '{colors.neutral.50}',
          _light: '{colors.neutral.50}',
          _dark: '{colors.neutral.950}',
        },
      },
      panel: {
        value: { base: '{colors.white}', _light: '{colors.white}', _dark: '{colors.neutral.900}' },
      },
      subtle: {
        value: {
          base: '{colors.neutral.100}',
          _light: '{colors.neutral.100}',
          _dark: '{colors.neutral.900}',
        },
      },
      muted: {
        value: {
          base: '{colors.neutral.100}',
          _light: '{colors.neutral.100}',
          _dark: '{colors.neutral.800}',
        },
      },
      emphasized: {
        value: {
          base: '{colors.neutral.200}',
          _light: '{colors.neutral.200}',
          _dark: '{colors.neutral.700}',
        },
      },
    },
    fg: {
      DEFAULT: {
        value: {
          base: '{colors.neutral.950}',
          _light: '{colors.neutral.950}',
          _dark: '{colors.neutral.50}',
        },
      },
      muted: {
        value: {
          base: '{colors.neutral.600}',
          _light: '{colors.neutral.600}',
          _dark: '{colors.neutral.400}',
        },
      },
      subtle: {
        value: {
          base: '{colors.neutral.500}',
          _light: '{colors.neutral.500}',
          _dark: '{colors.neutral.500}',
        },
      },
    },
    border: {
      DEFAULT: {
        value: {
          base: '{colors.neutral.200}',
          _light: '{colors.neutral.200}',
          _dark: '{colors.neutral.800}',
        },
      },
      muted: {
        value: {
          base: '{colors.neutral.100}',
          _light: '{colors.neutral.100}',
          _dark: '{colors.neutral.900}',
        },
      },
      emphasized: {
        value: {
          base: '{colors.neutral.300}',
          _light: '{colors.neutral.300}',
          _dark: '{colors.neutral.700}',
        },
      },
    },
    brand: {
      solid: {
        value: {
          base: '{colors.brand.600}',
          _light: '{colors.brand.600}',
          _dark: '{colors.brand.400}',
        },
      },
      contrast: {
        value: { base: '{colors.white}', _light: '{colors.white}', _dark: '{colors.brand.950}' },
      },
      fg: {
        value: {
          base: '{colors.brand.700}',
          _light: '{colors.brand.700}',
          _dark: '{colors.brand.300}',
        },
      },
      muted: {
        value: {
          base: '{colors.brand.100}',
          _light: '{colors.brand.100}',
          _dark: '{colors.brand.900}',
        },
      },
      subtle: {
        value: {
          base: '{colors.brand.50}',
          _light: '{colors.brand.50}',
          _dark: '{colors.brand.950}',
        },
      },
      emphasized: {
        value: {
          base: '{colors.brand.200}',
          _light: '{colors.brand.200}',
          _dark: '{colors.brand.800}',
        },
      },
      focusRing: {
        value: {
          base: '{colors.brand.400}',
          _light: '{colors.brand.400}',
          _dark: '{colors.brand.400}',
        },
      },
    },
    peach: {
      solid: {
        value: {
          base: '{colors.peach.500}',
          _light: '{colors.peach.500}',
          _dark: '{colors.peach.400}',
        },
      },
      contrast: {
        value: {
          base: '{colors.neutral.950}',
          _light: '{colors.neutral.950}',
          _dark: '{colors.neutral.950}',
        },
      },
      fg: {
        value: {
          base: '{colors.peach.700}',
          _light: '{colors.peach.700}',
          _dark: '{colors.peach.300}',
        },
      },
      muted: {
        value: {
          base: '{colors.peach.100}',
          _light: '{colors.peach.100}',
          _dark: '{colors.peach.900}',
        },
      },
      subtle: {
        value: {
          base: '{colors.peach.50}',
          _light: '{colors.peach.50}',
          _dark: '{colors.peach.950}',
        },
      },
      emphasized: {
        value: {
          base: '{colors.peach.200}',
          _light: '{colors.peach.200}',
          _dark: '{colors.peach.800}',
        },
      },
      focusRing: {
        value: {
          base: '{colors.peach.400}',
          _light: '{colors.peach.400}',
          _dark: '{colors.peach.400}',
        },
      },
    },
    chrome: {
      bg: {
        value: {
          base: 'rgba(250,248,252,0.78)',
          _light: 'rgba(250,248,252,0.78)',
          _dark: 'rgba(22,18,29,0.72)',
        },
      },
    },
    card: {
      bg: {
        value: { base: '{colors.white}', _light: '{colors.white}', _dark: '{colors.neutral.900}' },
      },
    },
    overlay: {
      scrim: {
        value: {
          base: 'rgba(22,18,29,0.45)',
          _light: 'rgba(22,18,29,0.45)',
          _dark: 'rgba(0,0,0,0.6)',
        },
      },
    },
  },
  shadows: {
    card: {
      value: {
        base: '0 1px 2px rgba(22,18,29,.06), 0 8px 24px -8px rgba(22,18,29,.14)',
        _light: '0 1px 2px rgba(22,18,29,.06), 0 8px 24px -8px rgba(22,18,29,.14)',
        _dark: '0 1px 2px rgba(0,0,0,.4), 0 12px 32px -12px rgba(0,0,0,.6)',
      },
    },
    float: {
      value: {
        base: '0 12px 40px -12px rgba(22,18,29,.28)',
        _light: '0 12px 40px -12px rgba(22,18,29,.28)',
        _dark: '0 16px 48px -12px rgba(0,0,0,.7)',
      },
    },
  },
});
