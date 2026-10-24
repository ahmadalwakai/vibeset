import { Box, Icon } from '@chakra-ui/react';
import type { ReactElement } from 'react';

type BrandWordmarkProps = {
  label: string;
  size?: 'header' | 'display';
};

export function BrandWordmark({ label, size = 'header' }: BrandWordmarkProps): ReactElement {
  return (
    <Box
      as="span"
      role="img"
      aria-label={label}
      dir="ltr"
      display="inline-block"
      whiteSpace="nowrap"
      textStyle={size === 'display' ? 'display.lg' : undefined}
      fontFamily="heading"
      fontSize={size === 'header' ? '2xl' : undefined}
      fontWeight="semibold"
      lineHeight={size === 'header' ? '1' : undefined}
    >
      <Box as="span" aria-hidden="true">
        v
        <Box as="span" position="relative" display="inline-block">
          i
          <Icon
            asChild
            position="absolute"
            insetStart="50%"
            top="0"
            boxSize={size === 'display' ? '2.5' : '2'}
            color="brand.fg"
            transform="translateX(-50%)"
          >
            <svg viewBox="10 10 44 44" fill="currentColor" aria-hidden="true" focusable="false">
              <path d="M32 10 38 26 54 32 38 38 32 54 26 38 10 32 26 26Z" />
            </svg>
          </Icon>
        </Box>
        beset
      </Box>
    </Box>
  );
}
