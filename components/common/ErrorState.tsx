'use client';

import { Box, Button, EmptyState, HStack, Stack } from '@chakra-ui/react';
import { WarningCircleIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import type { ErrorMessageCode } from '@/lib/result';

export interface ErrorStateProps {
  code?: ErrorMessageCode;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
}

export function ErrorState({
  code = 'INTERNAL',
  onRetry,
  retrying = false,
}: ErrorStateProps): ReactElement {
  const t = useTranslations('common');
  const errors = useTranslations('errors');
  const [pending, startTransition] = useTransition();

  return (
    <EmptyState.Root py="12" px="4" role="alert">
      <EmptyState.Content>
        <EmptyState.Indicator color="red.fg" aria-hidden>
          <Box asChild boxSize="12">
            <WarningCircleIcon weight="duotone" />
          </Box>
        </EmptyState.Indicator>
        <Stack gap="3" align="center" textAlign="center" maxW="lg">
          <EmptyState.Title as="h2" textStyle="heading.md">
            {t('errorTitle')}
          </EmptyState.Title>
          <EmptyState.Description textStyle="body.md" color="fg.muted">
            {errors(code)}
          </EmptyState.Description>
        </Stack>
        <HStack gap="3" mt="3" flexWrap="wrap" justify="center">
          {onRetry ? (
            <Button
              colorPalette="brand"
              size="lg"
              loading={pending || retrying}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await onRetry();
                  } catch {
                    /* The translated error remains visible when retry fails. */
                  }
                })
              }
            >
              {t('retry')}
            </Button>
          ) : null}
          <Button asChild variant="outline" size="lg">
            <Link href="/">{t('notFound.home')}</Link>
          </Button>
        </HStack>
      </EmptyState.Content>
    </EmptyState.Root>
  );
}
