import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import type { ReactElement, ReactNode } from 'react';

export interface StepCardProps {
  number: number;
  title: string;
  children: ReactNode;
  media?: ReactNode;
  headingLevel?: 'h2' | 'h3';
}
export function StepCard({
  number,
  title,
  children,
  media,
  headingLevel = 'h2',
}: StepCardProps): ReactElement {
  return (
    <Stack
      as="section"
      gap="4"
      bg="card.bg"
      borderWidth="hairline"
      borderColor="border"
      rounded="card"
      p={{ base: '5', md: '6' }}
      minW="0"
    >
      <HStack align="start" gap="3">
        <Box
          display="grid"
          placeItems="center"
          boxSize="8"
          flexShrink="0"
          rounded="full"
          bg="brand.subtle"
          color="brand.fg"
          aria-hidden="true"
        >
          {number}
        </Box>
        <Text as={headingLevel} textStyle="heading.sm" pt="1">
          {title}
        </Text>
      </HStack>
      <Box textStyle="body.md" color="fg.muted">
        {children}
      </Box>
      {media}
    </Stack>
  );
}
