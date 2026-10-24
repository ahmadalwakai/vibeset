'use client';

import { Box, Button, Image, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { ThemeSpec } from '@/lib/render/spec';
import type { StudioPanelProps } from '@/lib/studio';
import { ChoiceField, ColorField, GlyphListField, SliderField } from './PanelFields';

function WidgetSample({ spec }: { spec: ThemeSpec }): ReactElement {
  const t = useTranslations('studio.widgets');
  const common = useTranslations('common');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    spec: ThemeSpec;
    attempt: number;
    src: string | null;
  } | null>(null);
  const current = result?.spec === spec && result.attempt === attempt ? result : null;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([import('@/lib/render/widgets'), import('@/lib/client/glyphs')])
      .then(async ([renderer, loader]) => {
        const glyphs = await loader.loadGlyphs(spec.icons.glyphWeight, controller.signal);
        if (controller.signal.aborted) return;
        const output = renderer.renderWidget('glyphBadge', spec, { w: 256, h: 160 }, glyphs);
        setResult({
          spec,
          attempt,
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(output.svg)}`,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ spec, attempt, src: null });
      });
    return () => controller.abort();
  }, [spec, attempt]);
  return (
    <Box
      position="relative"
      aspectRatio={8 / 5}
      overflow="hidden"
      rounded="input"
      bg="bg.subtle"
      dir="ltr"
    >
      {current?.src ? (
        <Image
          src={current.src}
          alt={t('sampleTitle')}
          width={256}
          height={160}
          w="full"
          h="full"
          decoding="async"
        />
      ) : current ? (
        <Stack position="absolute" inset="0" align="center" justify="center" p="3">
          <Text textStyle="body.sm" color="fg.muted">
            {t('unavailable')}
          </Text>
          <Button minH="11" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            {common('retry')}
          </Button>
        </Stack>
      ) : (
        <Skeleton position="absolute" inset="0" aria-hidden />
      )}
    </Box>
  );
}

export function WidgetsPanel({ spec, onChange }: StudioPanelProps): ReactElement {
  const t = useTranslations('studio');
  const patch = (patch: Partial<ThemeSpec['widgets']>, control: string): void =>
    onChange({ type: 'patchWidgets', patch, control });
  return (
    <Stack gap="5">
      <WidgetSample spec={spec} />
      <ChoiceField
        label={t('fields.style')}
        value={spec.widgets.style}
        options={(['glass', 'solid', 'outline', 'paper'] as const).map((value) => ({
          value,
          label: t(`options.${value}`),
        }))}
        onChange={(style) => patch({ style }, 'style')}
      />
      <SliderField
        label={t('fields.radius')}
        value={spec.widgets.radius}
        max={0.5}
        onChange={(radius) => patch({ radius }, 'radius')}
      />
      {spec.widgets.style === 'outline' ? (
        <Text textStyle="caption" color="fg.muted">
          {t('widgets.outlineHint')}
        </Text>
      ) : null}
      {(['surface', 'ink', 'accent'] as const)
        .filter((role) => role !== 'surface' || spec.widgets.style !== 'outline')
        .map((role) => (
          <ColorField
            key={role}
            label={t(`fields.${role}`)}
            value={spec.widgets[role]}
            onChange={(value) => patch({ [role]: value }, role)}
          />
        ))}
      <GlyphListField
        label={t('fields.decor')}
        values={spec.decor}
        spec={spec}
        onChange={(decor) => onChange({ type: 'setDecor', decor })}
      />
    </Stack>
  );
}
