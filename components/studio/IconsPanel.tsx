'use client';

import { Flex, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { IconPreview } from '@/components/theme/IconPreview';
import { GLYPH_WEIGHTS } from '@/lib/render/spec';
import type { IconStyle } from '@/lib/render/spec';
import type { StudioPanelProps } from '@/lib/studio';
import { IconContrastBadge } from './ColorsPanel';
import { ChoiceField, ColorField, SingleGlyphField, SliderField, ToggleField } from './PanelFields';
import { iconFillPatch } from './panel-utils';

export function IconsPanel({ spec, onChange }: StudioPanelProps): ReactElement {
  const t = useTranslations('studio');
  const icons = spec.icons;
  const patch = (patch: Partial<IconStyle>, control: string): void =>
    onChange({ type: 'patchIcons', patch, control });
  return (
    <Stack gap="5">
      <Flex gap="2" wrap="wrap" role="img" aria-label={t('icons.previewLabel')} dir="ltr">
        {['phone', 'chat-circle-text', 'camera', 'headphones', 'sparkle'].map((glyph) => (
          <IconPreview key={glyph} spec={spec} glyph={glyph} platform="shaped" label="" />
        ))}
      </Flex>
      <ChoiceField
        label={t('fields.fill')}
        value={icons.fill}
        options={(['solid', 'gradient', 'glass', 'outline', 'pattern', 'wallpaper'] as const).map(
          (value) => ({ value, label: t(`options.${value}`) }),
        )}
        onChange={(fill) => patch(iconFillPatch(icons, spec.palette, fill), 'fill')}
      />
      <ChoiceField
        label={t('fields.shape')}
        value={icons.shape}
        options={(['squircle', 'circle', 'rounded', 'square'] as const).map((value) => ({
          value,
          label: t(`options.${value}`),
        }))}
        onChange={(shape) => patch({ shape }, 'shape')}
      />
      <Text textStyle="caption" color="fg.muted">
        {t('icons.shapeHint')}
      </Text>
      {icons.fill === 'solid' || icons.fill === 'gradient' ? (
        <ColorField
          label={t('fields.bg')}
          value={icons.bg}
          onChange={(bg) => patch({ bg }, 'bg')}
        />
      ) : (
        <Text textStyle="caption" color="fg.muted">
          {t('icons.fillHint')}
        </Text>
      )}
      {icons.fill === 'gradient' ? (
        <ColorField
          label={t('fields.bg2')}
          value={icons.bg2 ?? spec.palette.accent}
          onChange={(bg2) => patch({ bg2 }, 'bg2')}
        />
      ) : null}
      <ColorField
        label={t('fields.glyphColor')}
        value={icons.glyphColor}
        onChange={(glyphColor) => patch({ glyphColor }, 'glyphColor')}
      />
      <IconContrastBadge icons={icons} palette={spec.palette} />
      <ChoiceField
        label={t('fields.weight')}
        value={icons.glyphWeight}
        options={GLYPH_WEIGHTS.map((value) => ({
          value,
          label: t(`options.${value === 'light' ? 'lightWeight' : value}`),
        }))}
        onChange={(glyphWeight) => patch({ glyphWeight }, 'glyphWeight')}
      />
      <SliderField
        label={t('fields.glyphScale')}
        value={icons.glyphScale}
        min={0.4}
        max={0.7}
        onChange={(glyphScale) => patch({ glyphScale }, 'glyphScale')}
      />
      <ToggleField
        label={t('fields.border')}
        checked={icons.border !== null}
        onChange={(enabled) =>
          patch({ border: enabled ? { width: 0.02, color: spec.palette.ink } : null }, 'border')
        }
      />
      {icons.border ? (
        <>
          <SliderField
            label={t('fields.borderWidth')}
            value={icons.border.width}
            max={0.08}
            step={0.005}
            onChange={(width) =>
              patch(
                {
                  border: {
                    ...icons.border,
                    width,
                    color: icons.border?.color ?? spec.palette.ink,
                  },
                },
                'border.width',
              )
            }
          />
          <ColorField
            label={t('fields.borderColor')}
            value={icons.border.color}
            onChange={(color) =>
              patch({ border: { width: icons.border?.width ?? 0.02, color } }, 'border.color')
            }
          />
        </>
      ) : null}
      <ToggleField
        label={t('fields.sticker')}
        checked={icons.sticker !== null}
        onChange={(enabled) =>
          patch(
            {
              sticker: enabled
                ? { glyph: 'sparkle', color: spec.palette.accent, corner: 'tr' }
                : null,
            },
            'sticker',
          )
        }
      />
      {icons.sticker ? (
        <>
          <SingleGlyphField
            label={t('fields.sticker')}
            value={icons.sticker.glyph}
            spec={spec}
            onChange={(glyph) =>
              patch(
                {
                  sticker: {
                    glyph,
                    color: icons.sticker?.color ?? spec.palette.accent,
                    corner: icons.sticker?.corner ?? 'tr',
                  },
                },
                'sticker.glyph',
              )
            }
          />
          <ColorField
            label={t('fields.stickerColor')}
            value={icons.sticker.color}
            onChange={(color) =>
              patch(
                {
                  sticker: {
                    glyph: icons.sticker?.glyph ?? 'sparkle',
                    color,
                    corner: icons.sticker?.corner ?? 'tr',
                  },
                },
                'sticker.color',
              )
            }
          />
          <ChoiceField
            label={t('fields.corner')}
            value={icons.sticker.corner}
            options={(['tl', 'tr', 'bl', 'br'] as const).map((value) => ({
              value,
              label: t(`options.${value}`),
            }))}
            onChange={(corner) =>
              patch(
                {
                  sticker: {
                    glyph: icons.sticker?.glyph ?? 'sparkle',
                    color: icons.sticker?.color ?? spec.palette.accent,
                    corner,
                  },
                },
                'sticker.corner',
              )
            }
          />
        </>
      ) : null}
      <ToggleField
        label={t('fields.shadow')}
        checked={icons.shadow}
        onChange={(shadow) => patch({ shadow }, 'shadow')}
      />
    </Stack>
  );
}
