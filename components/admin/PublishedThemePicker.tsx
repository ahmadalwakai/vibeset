'use client';
import { Box, Button, Image, Input, SimpleGrid, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import type { ReactElement } from 'react';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import type { AdminPage } from '@/lib/admin';
import type { AdminThemeChoice } from '@/lib/admin-content';
import type { ErrorMessageCode } from '@/lib/result';
import { localized } from '@/lib/utils/localized';
import { searchAdminPublishedThemes } from '@/server/actions/admin/collections';

export function PublishedThemePicker({
  open,
  onOpenChange,
  onPick,
  disabledIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (theme: AdminThemeChoice) => void;
  disabledIds?: readonly string[];
}): ReactElement {
  const t = useTranslations('admin.collections'),
    errors = useTranslations('errors'),
    locale = useLocale(),
    id = useId();
  const [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([q, page, attempt]);
  const [loaded, setLoaded] = useState<{
    key: string;
    data: AdminPage<AdminThemeChoice> | null;
    error: ErrorMessageCode | null;
  } | null>(null);
  const current = loaded?.key === key ? loaded : null;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void searchAdminPublishedThemes({ q, page })
        .then((result) => {
          if (controller.signal.aborted) return;
          setLoaded(
            result.ok
              ? { key, data: result.data, error: null }
              : { key, data: null, error: result.error.code },
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoaded({ key, data: null, error: 'NETWORK' });
        });
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [open, q, page, key]);
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('pickerTitle')}>
      <Stack gap="4">
        <Input
          id={id}
          type="search"
          aria-label={t('pickerSearch')}
          placeholder={t('pickerSearch')}
          value={q}
          maxLength={120}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          minH="11"
        />
        {!current ? (
          <Skeleton h="64" />
        ) : current.error ? (
          <Stack>
            <Text role="alert">{errors(current.error)}</Text>
            <Button minH="11" onClick={() => setAttempt((value) => value + 1)}>
              {t('refresh')}
            </Button>
          </Stack>
        ) : current.data?.items.length ? (
          <>
            <SimpleGrid columns={{ base: 2, md: 3 }} gap="3">
              {current.data.items.map((theme) => (
                <Button
                  key={theme.id}
                  h="auto"
                  minH="24"
                  p="2"
                  variant="outline"
                  display="flex"
                  flexDirection="column"
                  disabled={disabledIds.includes(theme.id)}
                  aria-label={t('pick', { name: localized(theme, locale) })}
                  onClick={() => onPick(theme)}
                >
                  <Box
                    position="relative"
                    aspectRatio={1}
                    overflow="hidden"
                    rounded="input"
                    bg="bg.subtle"
                    w="full"
                  >
                    {theme.thumbUrl ? (
                      <Image
                        src={theme.thumbUrl}
                        alt=""
                        width={160}
                        height={160}
                        loading="lazy"
                        decoding="async"
                        objectFit="cover"
                        w="full"
                        h="full"
                      />
                    ) : null}
                  </Box>
                  <Text whiteSpace="normal" textStyle="body.sm">
                    {localized(theme, locale)}
                  </Text>
                </Button>
              ))}
            </SimpleGrid>
            <Stack direction="row">
              <Button disabled={page === 1} minH="11" onClick={() => setPage((value) => value - 1)}>
                {t('previous')}
              </Button>
              <Button
                disabled={!current.data.nextPage}
                minH="11"
                onClick={() => setPage((value) => value + 1)}
              >
                {t('next')}
              </Button>
            </Stack>
          </>
        ) : (
          <Text>{t('pickerEmpty')}</Text>
        )}
      </Stack>
    </ResponsiveSheet>
  );
}
