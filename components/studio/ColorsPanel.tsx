'use client';

import { Badge, Box, Button, Flex, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { CuratedPalette } from '@/lib/generator';
import type { IconStyle } from '@/lib/render/spec';
import type { Palette } from '@/lib/render/types';
import type { PaletteRole, StudioPanelProps } from '@/lib/studio';
import { formatNumber } from '@/lib/utils/format';
import { ChoiceField, ColorField } from './PanelFields';

const ROLES: readonly PaletteRole[] = ['bg', 'surface', 'primary', 'accent', 'ink', 'inkMuted'];

export function IconContrastBadge({
  icons,
  palette,
}: {
  icons: IconStyle;
  palette: Palette;
}): ReactElement {
  const t = useTranslations('studio.colors');
  const common = useTranslations('common');
  const locale = useLocale();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    icons: IconStyle;
    palette: Palette;
    attempt: number;
    value: number | null;
  } | null>(null);
  const current =
    result?.icons === icons && result.palette === palette && result.attempt === attempt
      ? result
      : null;
  useEffect(() => {
    let active = true;
    void import('@/lib/render/icon-colors')
      .then(({ minIconContrast }) => {
        if (active) setResult({ icons, palette, attempt, value: minIconContrast(icons, palette) });
      })
      .catch(() => {
        if (active) setResult({ icons, palette, attempt, value: null });
      });
    return () => {
      active = false;
    };
  }, [icons, palette, attempt]);
  return (
    <Stack gap="2">
      {current?.value !== null && current?.value !== undefined ? (
        <Badge
          colorPalette={current.value < 3 ? 'orange' : 'green'}
          alignSelf="start"
          whiteSpace="normal"
          role="status"
        >
          {t(current.value < 3 ? 'contrastLow' : 'contrastGood', {
            ratio: formatNumber(current.value, locale, { maximumFractionDigits: 2 }),
          })}
        </Badge>
      ) : current ? (
        <Button variant="outline" minH="11" onClick={() => setAttempt((value) => value + 1)}>
          {common('retry')}
        </Button>
      ) : (
        <Skeleton h="6" w="40" />
      )}
      <Text textStyle="caption" color="fg.muted">
        {t('contrastHint')}
      </Text>
    </Stack>
  );
}

export function ColorsPanel({ spec, onChange }: StudioPanelProps): ReactElement {
  const t = useTranslations('studio');
  const common = useTranslations('common');
  const locale = useLocale();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    attempt: number;
    palettes: readonly CuratedPalette[] | null;
  } | null>(null);
  const current = loaded?.attempt === attempt ? loaded : null;
  useEffect(() => {
    let active = true;
    void import('@/content/palettes')
      .then(({ PALETTES }) => {
        if (active) setLoaded({ attempt, palettes: PALETTES });
      })
      .catch(() => {
        if (active) setLoaded({ attempt, palettes: null });
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <Stack gap="5">
      <Text as="h3" textStyle="heading.sm">
        {t('colors.presets')}
      </Text>
      {current?.palettes ? (
        <Stack gap="2" maxH="64" overflowY="auto" p="1">
          {current.palettes.map((palette) => {
            const name = locale === 'ar' ? palette.nameAr : palette.nameEn;
            return (
              <Button
                key={palette.id}
                variant="outline"
                minH="12"
                rounded="input"
                justifyContent="space-between"
                gap="3"
                aria-label={t('colors.apply', { name })}
                onClick={() => onChange({ type: 'applyPalettePreset', palette })}
              >
                <Text as="span" textStyle="caption" truncate>
                  {name}
                </Text>
                <Flex gap="1" aria-hidden>
                  {[palette.bg, palette.primary, palette.accent, palette.ink].map(
                    (color, index) => (
                      <Box
                        key={index}
                        boxSize="5"
                        rounded="full"
                        bg={color}
                        borderWidth="hairline"
                        borderColor="border"
                      />
                    ),
                  )}
                </Flex>
              </Button>
            );
          })}
        </Stack>
      ) : current ? (
        <Stack gap="2" role="alert">
          <Text textStyle="body.sm" color="fg.muted">
            {t('colors.unavailable')}
          </Text>
          <Button variant="outline" minH="11" onClick={() => setAttempt((value) => value + 1)}>
            {common('retry')}
          </Button>
        </Stack>
      ) : (
        <Stack gap="2" role="status" aria-label={t('colors.loading')}>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} h="12" rounded="input" />
          ))}
        </Stack>
      )}
      <ChoiceField
        label={t('fields.mode')}
        value={spec.palette.mode}
        segmented
        options={(['light', 'dark'] as const).map((value) => ({
          value,
          label: t(`options.${value}`),
        }))}
        onChange={(mode) =>
          onChange({ type: 'applyPalettePreset', palette: { ...spec.palette, mode } })
        }
      />
      {ROLES.map((role) => (
        <ColorField
          key={role}
          label={t(`fields.${role}`)}
          value={spec.palette[role]}
          onChange={(value) => onChange({ type: 'setPaletteRole', role, value })}
        />
      ))}
      <IconContrastBadge icons={spec.icons} palette={spec.palette} />
    </Stack>
  );
}
