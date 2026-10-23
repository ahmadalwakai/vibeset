import { Box, EmptyState as ChakraEmptyState, Stack } from '@chakra-ui/react';
import { SparkleIcon } from '@phosphor-icons/react/ssr';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps): ReactElement {
  const t = useTranslations('common');

  return (
    <ChakraEmptyState.Root py="12" px="4">
      <ChakraEmptyState.Content>
        <ChakraEmptyState.Indicator color="brand.fg" aria-hidden>
          <Box asChild boxSize="12">
            {icon ?? <SparkleIcon weight="duotone" />}
          </Box>
        </ChakraEmptyState.Indicator>
        <Stack gap="3" align="center" maxW="lg" textAlign="center">
          <ChakraEmptyState.Title as="h2" textStyle="heading.md">
            {title ?? t('emptyTitle')}
          </ChakraEmptyState.Title>
          <ChakraEmptyState.Description textStyle="body.md" color="fg.muted">
            {description ?? t('emptyDescription')}
          </ChakraEmptyState.Description>
        </Stack>
        {action ? <Box mt="3">{action}</Box> : null}
      </ChakraEmptyState.Content>
    </ChakraEmptyState.Root>
  );
}
