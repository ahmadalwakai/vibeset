'use client';

import { Button, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { GLYPH_WEIGHTS, PATTERNS } from '@/lib/render/spec';
import type {
  GeneratedWallpaperKind,
  StudioPanelProps,
  WallpaperPatch,
  WallpaperTarget,
} from '@/lib/studio';
import {
  ChoiceField,
  ColorListField,
  GlyphListField,
  NumberField,
  SliderField,
  ToggleField,
} from './PanelFields';
import { scatterSizePatch } from './panel-utils';

const KINDS: readonly GeneratedWallpaperKind[] = [
  'mesh',
  'blobs',
  'waves',
  'pattern',
  'scatter',
  'aurora',
  'sky',
  'shapes',
];

export function WallpaperPanel({ spec, onChange }: StudioPanelProps): ReactElement {
  const t = useTranslations('studio');
  const [target, setTarget] = useState<WallpaperTarget>('home');
  const wallpaper = target === 'home' ? spec.wallpaper : (spec.lockWallpaper ?? spec.wallpaper);
  const patch = (patch: WallpaperPatch, control: string): void =>
    onChange({ type: 'patchWallpaper', target, patch, control: `${target}.${control}` });
  return (
    <Stack gap="5">
      <ChoiceField
        label={t('fields.wallpaperTarget')}
        value={target}
        segmented
        options={(['home', 'lock'] as const).map((value) => ({
          value,
          label: t(`fields.${value}`),
        }))}
        onChange={setTarget}
      />
      <ChoiceField
        label={t('fields.lockMode')}
        value={spec.lockWallpaper ? 'variant' : 'same'}
        segmented
        options={(['same', 'variant'] as const).map((value) => ({
          value,
          label: t(`fields.${value}`),
        }))}
        onChange={(mode) => onChange({ type: 'setLockMode', mode })}
      />
      {wallpaper.kind === 'image' ? (
        <Text textStyle="body.sm" color="fg.muted">
          {t('fields.imageHint')}
        </Text>
      ) : null}
      <ChoiceField
        label={t('fields.kind')}
        value={wallpaper.kind}
        segmented
        options={[
          ...KINDS.map((value) => ({ value, label: t(`options.${value}`) })),
          ...(wallpaper.kind === 'image'
            ? [{ value: 'image' as const, label: t('options.image') }]
            : []),
        ]}
        onChange={(kind) => {
          if (kind !== 'image') onChange({ type: 'setWallpaper', kind, target });
        }}
      />
      {'seed' in wallpaper ? (
        <>
          <NumberField
            label={t('fields.seed')}
            value={wallpaper.seed}
            min={0}
            max={2_147_483_647}
            onChange={(seed) => onChange({ type: 'shuffleSeed', seed, target })}
          />
          <Button
            variant="outline"
            minH="11"
            onClick={() => onChange({ type: 'shuffleSeed', target })}
          >
            {t('fields.shuffle')}
          </Button>
        </>
      ) : null}
      {wallpaper.kind === 'mesh' ? (
        <>
          <SliderField
            label={t('fields.points')}
            value={wallpaper.points}
            min={3}
            max={7}
            step={1}
            onChange={(points) => patch({ points }, 'points')}
          />
          <SliderField
            label={t('fields.softness')}
            value={wallpaper.softness}
            onChange={(softness) => patch({ softness }, 'softness')}
          />
        </>
      ) : null}
      {wallpaper.kind === 'blobs' ? (
        <>
          <SliderField
            label={t('fields.count')}
            value={wallpaper.count}
            min={3}
            max={9}
            step={1}
            onChange={(count) => patch({ count }, 'count')}
          />
          <SliderField
            label={t('fields.blur')}
            value={wallpaper.blur}
            onChange={(blur) => patch({ blur }, 'blur')}
          />
        </>
      ) : null}
      {wallpaper.kind === 'waves' ? (
        <>
          <SliderField
            label={t('fields.layers')}
            value={wallpaper.layers}
            min={2}
            max={6}
            step={1}
            onChange={(layers) => patch({ layers }, 'layers')}
          />
          <SliderField
            label={t('fields.amplitude')}
            value={wallpaper.amplitude}
            onChange={(amplitude) => patch({ amplitude }, 'amplitude')}
          />
          <SliderField
            label={t('fields.frequency')}
            value={wallpaper.frequency}
            onChange={(frequency) => patch({ frequency }, 'frequency')}
          />
        </>
      ) : null}
      {wallpaper.kind === 'pattern' ? (
        <>
          <ChoiceField
            label={t('fields.pattern')}
            value={wallpaper.pattern}
            options={PATTERNS.map((value) => ({ value, label: t(`options.${value}`) }))}
            onChange={(pattern) => patch({ pattern }, 'pattern')}
          />
          <SliderField
            label={t('fields.scale')}
            value={wallpaper.scale}
            min={0.5}
            max={3}
            step={0.05}
            onChange={(scale) => patch({ scale }, 'scale')}
          />
          <SliderField
            label={t('fields.rotation')}
            value={wallpaper.rotation}
            min={-45}
            max={45}
            step={1}
            onChange={(rotation) => patch({ rotation }, 'rotation')}
          />
        </>
      ) : null}
      {wallpaper.kind === 'scatter' ? (
        <>
          <GlyphListField
            label={t('fields.glyphs')}
            values={wallpaper.glyphs}
            minimum={1}
            spec={spec}
            onChange={(glyphs) => patch({ glyphs }, 'glyphs')}
          />
          <ChoiceField
            label={t('fields.weight')}
            value={wallpaper.weight}
            options={GLYPH_WEIGHTS.map((value) => ({
              value,
              label: t(`options.${value === 'light' ? 'lightWeight' : value}`),
            }))}
            onChange={(weight) => patch({ weight }, 'weight')}
          />
          <SliderField
            label={t('fields.density')}
            value={wallpaper.density}
            onChange={(density) => patch({ density }, 'density')}
          />
          <SliderField
            label={t('fields.sizeMin')}
            value={wallpaper.sizeMin}
            min={0.02}
            max={0.2}
            step={0.01}
            onChange={(value) => patch(scatterSizePatch(wallpaper, 'min', value), 'sizeMin')}
          />
          <SliderField
            label={t('fields.sizeMax')}
            value={wallpaper.sizeMax}
            min={0.03}
            max={0.35}
            step={0.01}
            onChange={(value) => patch(scatterSizePatch(wallpaper, 'max', value), 'sizeMax')}
          />
          <ToggleField
            label={t('fields.rotate')}
            checked={wallpaper.rotate}
            onChange={(rotate) => patch({ rotate }, 'rotate')}
          />
        </>
      ) : null}
      {wallpaper.kind === 'aurora' ? (
        <SliderField
          label={t('fields.bands')}
          value={wallpaper.bands}
          min={2}
          max={5}
          step={1}
          onChange={(bands) => patch({ bands }, 'bands')}
        />
      ) : null}
      {wallpaper.kind === 'sky' ? (
        <>
          <ChoiceField
            label={t('fields.skyMode')}
            value={wallpaper.mode}
            options={(['day', 'sunset', 'night'] as const).map((value) => ({
              value,
              label: t(`options.${value}`),
            }))}
            onChange={(mode) => patch({ mode }, 'mode')}
          />
          <SliderField
            label={t('fields.clouds')}
            value={wallpaper.clouds}
            onChange={(clouds) => patch({ clouds }, 'clouds')}
          />
          <SliderField
            label={t('fields.stars')}
            value={wallpaper.stars}
            onChange={(stars) => patch({ stars }, 'stars')}
          />
          <ToggleField
            label={t('fields.moon')}
            checked={wallpaper.moon}
            onChange={(moon) => patch({ moon }, 'moon')}
          />
        </>
      ) : null}
      {wallpaper.kind === 'shapes' ? (
        <SliderField
          label={t('fields.density')}
          value={wallpaper.density}
          onChange={(density) => patch({ density }, 'density')}
        />
      ) : null}
      {wallpaper.kind === 'image' ? (
        <>
          <SliderField
            label={t('fields.focalX')}
            value={wallpaper.focalX}
            onChange={(focalX) => patch({ focalX }, 'focalX')}
          />
          <SliderField
            label={t('fields.focalY')}
            value={wallpaper.focalY}
            onChange={(focalY) => patch({ focalY }, 'focalY')}
          />
          <SliderField
            label={t('fields.dim')}
            value={wallpaper.dim}
            max={0.6}
            onChange={(dim) => patch({ dim }, 'dim')}
          />
        </>
      ) : null}
      {'grain' in wallpaper ? (
        <SliderField
          label={t('fields.grain')}
          value={wallpaper.grain}
          onChange={(grain) => patch({ grain }, 'grain')}
        />
      ) : null}
      {'colors' in wallpaper ? (
        <>
          <ToggleField
            label={t('fields.usePalette')}
            checked={wallpaper.colors === null}
            onChange={(usePalette) =>
              patch(
                { colors: usePalette ? null : [spec.palette.primary, spec.palette.accent] },
                'colors',
              )
            }
          />
          {wallpaper.colors ? (
            <ColorListField
              colors={wallpaper.colors}
              onChange={(colors) => patch({ colors }, 'colors')}
            />
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}
