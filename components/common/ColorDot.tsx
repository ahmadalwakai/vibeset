import { Box, Button } from '@chakra-ui/react';
import type { ReactElement } from 'react';
import type { ColorFamily } from '@/lib/dto';

const colors: Record<Exclude<ColorFamily, 'multi'>, string> = {
  pink: 'pink.400',
  red: 'red.500',
  orange: 'orange.400',
  yellow: 'yellow.300',
  green: 'green.500',
  teal: 'teal.400',
  blue: 'blue.500',
  purple: 'purple.500',
  brown: 'orange.900',
  black: 'neutral.950',
  white: 'white',
  gray: 'neutral.500',
};

export interface ColorDotProps {
  color: ColorFamily;
  label: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function ColorDot({
  color,
  label,
  selected = false,
  onClick,
  disabled = false,
}: ColorDotProps): ReactElement {
  const swatch = (
    <Box
      boxSize="6"
      rounded="full"
      borderWidth="hairline"
      borderColor="border.emphasized"
      bg={color === 'multi' ? undefined : colors[color]}
      bgGradient={color === 'multi' ? 'to-br' : undefined}
      gradientFrom={color === 'multi' ? 'brand.400' : undefined}
      gradientVia={color === 'multi' ? 'peach.400' : undefined}
      gradientTo={color === 'multi' ? 'blue.400' : undefined}
    />
  );
  return (
    <Button
      type="button"
      size="lg"
      minW="11"
      px="2"
      rounded="full"
      variant="ghost"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      outline={selected ? 'solid' : undefined}
      outlineWidth={selected ? 'medium' : undefined}
      outlineColor="brand.focusRing"
      outlineOffset="{spacing.0.5}"
    >
      {swatch}
    </Button>
  );
}
