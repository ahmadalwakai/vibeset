'use client';

import { Box, Button, Field, Input, SimpleGrid, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import type { ReactElement } from 'react';
import { loadGlyphManifest, searchGlyphManifest } from '@/lib/client/glyph-manifest';
import type { GlyphManifestEntry } from '@/lib/icon-export';
import type { ThemeSpec } from '@/lib/render/spec';
import { formatNumber } from '@/lib/utils/format';
import { IconPreview } from './IconPreview';

export interface GlyphPickerProps {
  value: string | null;
  onChange: (name: string) => void;
  spec: ThemeSpec;
  platform: 'ios' | 'shaped';
  disabled?: boolean;
}

export function GlyphPicker({
  value,
  onChange,
  spec,
  platform,
  disabled = false,
}: GlyphPickerProps): ReactElement {
  const t = useTranslations('theme.icons.glyph');
  const common = useTranslations('common');
  const locale = useLocale();
  const id = useId();
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    attempt: number;
    entries: readonly GlyphManifestEntry[] | null;
  } | null>(null);
  const current = loaded?.attempt === attempt ? loaded : null;
  const result = searchGlyphManifest(current?.entries ?? [], query);

  useEffect(() => {
    const controller = new AbortController();
    void loadGlyphManifest(controller.signal)
      .then((entries) => {
        if (!controller.signal.aborted) setLoaded({ attempt, entries });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ attempt, entries: null });
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <Stack gap="3" aria-label={t('title')}>
      <Field.Root>
        <Field.Label htmlFor={id}>{t('searchLabel')}</Field.Label>
        <Input
          id={id}
          type="search"
          value={query}
          maxLength={100}
          placeholder={t('searchPlaceholder')}
          minH="11"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field.Root>
      {current?.entries ? (
        <>
          <Text textStyle="caption" color="fg.muted" role="status">
            {t('limited', {
              count: formatNumber(result.entries.length, locale),
              total: formatNumber(result.total, locale),
            })}
          </Text>
          {result.entries.length ? (
            <SimpleGrid
              columns={{ base: 3, sm: 4 }}
              gap="2"
              maxH="80"
              overflowY="auto"
              p="1"
              rounded="input"
              role="group"
              aria-label={t('title')}
            >
              {result.entries.map((entry) => (
                <Button
                  key={entry.name}
                  variant="outline"
                  h="auto"
                  minH="24"
                  minW="0"
                  p="2"
                  rounded="input"
                  flexDirection="column"
                  gap="2"
                  borderColor={value === entry.name ? 'brand.solid' : 'border'}
                  bg={value === entry.name ? 'brand.subtle' : 'bg.panel'}
                  aria-label={t('select', { name: entry.name })}
                  aria-pressed={value === entry.name}
                  disabled={disabled}
                  onClick={() => onChange(entry.name)}
                >
                  <IconPreview spec={spec} glyph={entry.name} platform={platform} label="" />
                  <Text
                    as="span"
                    textStyle="caption"
                    whiteSpace="normal"
                    overflowWrap="anywhere"
                    lineClamp="2"
                  >
                    {entry.name.replaceAll('-', ' ')}
                  </Text>
                </Button>
              ))}
            </SimpleGrid>
          ) : (
            <Text textStyle="body.sm" color="fg.muted" role="status">
              {t('empty')}
            </Text>
          )}
          {value ? (
            <Text textStyle="caption" color="brand.fg">
              {t('selected', { name: value })}
            </Text>
          ) : null}
        </>
      ) : current ? (
        <Stack gap="3" role="alert">
          <Text textStyle="body.sm" color="fg.muted">
            {t('error')}
          </Text>
          <Button
            type="button"
            variant="outline"
            minH="11"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {common('retry')}
          </Button>
        </Stack>
      ) : (
        <Box role="status" aria-label={t('loading')}>
          <SimpleGrid columns={{ base: 3, sm: 4 }} gap="2" aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} h="24" rounded="input" />
            ))}
          </SimpleGrid>
        </Box>
      )}
    </Stack>
  );
}
