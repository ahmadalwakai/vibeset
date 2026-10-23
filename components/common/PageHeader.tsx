import { Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import type { ReactElement, ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps): ReactElement {
  return (
    <Flex
      as="header"
      direction={{ base: 'column', md: 'row' }}
      gap="5"
      justify="space-between"
      align={{ base: 'stretch', md: 'center' }}
    >
      <Stack gap="3" minW="0" maxW="3xl">
        {eyebrow ? (
          <Text textStyle="caption" color="brand.fg">
            {eyebrow}
          </Text>
        ) : null}
        <Heading as="h1" textStyle="display.xl" overflowWrap="anywhere">
          {title}
        </Heading>
        {description ? (
          <Text textStyle="body.md" color="fg.muted">
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions ? <Box flexShrink="0">{actions}</Box> : null}
    </Flex>
  );
}
