'use client';

import {
  Badge,
  Box,
  Button,
  Field,
  Grid,
  Heading,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { z } from 'zod';
import { ErrorState } from '@/components/common/ErrorState';
import {
  SAMPLE_PALETTES,
  WALLPAPER_KINDS,
  playgroundStateSchema,
  renderSampleSpec,
} from '@/content/render-sample';
import { FONT_IDS, GLYPH_WEIGHTS, PATTERNS, themeSpecSchema } from '@/lib/render/spec';
import type {
  GlyphSource,
  IconFill,
  RenderResult,
  ThemeSpec,
  WidgetKind,
} from '@/lib/render/index';
import { formatNumber } from '@/lib/utils/format';
import { RenderTile } from './RenderTile';

const controlsSchema = playgroundStateSchema.extend({
  weight: z.enum(GLYPH_WEIGHTS).default('regular'),
  pattern: z.enum(PATTERNS).default('bows'),
  skyMode: z.enum(['day', 'sunset', 'night']).default('sunset'),
});
type Controls = z.infer<typeof controlsSchema>;
type Group = 'wallpapers' | 'icons' | 'widgets' | 'previews';
interface TileData {
  id: string;
  title: string;
  result: RenderResult;
  group: Group;
}
type Batch = { key: string } & ({ status: 'ready'; items: TileData[] } | { status: 'error' });
const groups: readonly Group[] = ['wallpapers', 'icons', 'widgets', 'previews'];
const fills = [
  'solid',
  'gradient',
  'glass',
  'outline',
  'pattern',
  'wallpaper',
] as const satisfies readonly IconFill[];
const widgets = [
  'glyphBadge',
  'ring',
  'stickerCollage',
  'photoFrame',
] as const satisfies readonly WidgetKind[];
const skyModes = ['day', 'sunset', 'night'] as const;

function initialControls(query: string): { controls: Controls; invalid: boolean } {
  const params = new URLSearchParams(query);
  const duplicate = Object.keys(controlsSchema.shape).some((key) => params.getAll(key).length > 1);
  const input = Object.fromEntries(params);
  // An empty numeric parameter is not an intentional zero.
  const emptyNumber = ['seed', 'grain'].some((key) => params.has(key) && !params.get(key)?.trim());
  const result = controlsSchema.safeParse(input);
  return result.success && !duplicate && !emptyNumber
    ? { controls: result.data, invalid: false }
    : { controls: controlsSchema.parse({}), invalid: true };
}

function makeSpec(controls: Controls): ThemeSpec {
  const spec = renderSampleSpec(controls);
  let wallpaper = spec.wallpaper;
  if (wallpaper.kind === 'scatter') wallpaper = { ...wallpaper, weight: controls.weight };
  if (wallpaper.kind === 'pattern') wallpaper = { ...wallpaper, pattern: controls.pattern };
  if (wallpaper.kind === 'sky')
    wallpaper = {
      ...wallpaper,
      mode: controls.skyMode,
      moon: controls.skyMode === 'night',
      stars: controls.skyMode === 'night' ? 0.75 : 0.2,
    };
  return themeSpecSchema.parse({
    ...spec,
    wallpaper,
    icons: { ...spec.icons, glyphWeight: controls.weight },
  });
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field.Root>
      <Field.Label htmlFor={id}>{label}</Field.Label>
      <NativeSelect.Root>
        <NativeSelect.Field
          id={id}
          value={value}
          minH="11"
          rounded="input"
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Field.Root>
  );
}

export function RenderPlayground(): ReactElement {
  const t = useTranslations('studio.renderPlayground');
  const common = useTranslations('common');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [initial] = useState(() => initialControls(searchParams.toString()));
  const [urlInvalid, setUrlInvalid] = useState(initial.invalid);
  const [controls, setControls] = useState(initial.controls);
  const [seedDraft, setSeedDraft] = useState(String(initial.controls.seed));
  const [seedInvalid, setSeedInvalid] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [batch, setBatch] = useState<Batch>();
  const [photo, setPhoto] = useState<File>();
  const [photoStatus, setPhotoStatus] = useState<'loading' | 'ready' | 'error'>();
  const photoVersion = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = `${JSON.stringify(controls)}:${attempt}`;
  const current = batch?.key === key ? batch : undefined;
  const spec = useMemo(() => makeSpec(controls), [controls]);

  function updateControls(patch: Partial<Record<keyof Controls, unknown>>): void {
    const result = controlsSchema.safeParse({ ...controls, ...patch });
    if (!result.success) return;
    setUrlInvalid(false);
    setControls(result.data);
    const url = new URL(window.location.href);
    for (const [name, value] of Object.entries(result.data))
      url.searchParams.set(name, String(value));
    window.history.replaceState(null, '', url);
  }

  function applySeed(): void {
    const valid =
      /^\d+$/.test(seedDraft.trim()) &&
      controlsSchema.shape.seed.safeParse(seedDraft.trim()).success;
    setSeedInvalid(!valid);
    if (valid) updateControls({ seed: Number(seedDraft.trim()) });
  }

  function shuffle(): void {
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    if (random === undefined) return;
    const seed = random & 0x7fff_ffff;
    setSeedDraft(String(seed));
    setSeedInvalid(false);
    updateControls({ seed });
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = event.currentTarget.files?.[0];
    const version = ++photoVersion.current;
    if (!selected) return;
    const checked = z
      .object({
        type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        size: z
          .number()
          .int()
          .positive()
          .max(15 * 1024 * 1024),
      })
      .safeParse({ type: selected.type, size: selected.size });
    if (!checked.success) {
      setPhoto(undefined);
      setPhotoStatus('error');
      return;
    }
    setPhotoStatus('loading');
    try {
      const bytes = new Uint8Array(await selected.slice(0, 12).arrayBuffer());
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp =
        String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
      if (!{ 'image/png': png, 'image/jpeg': jpeg, 'image/webp': webp }[checked.data.type])
        throw new Error('Invalid photo signature');
      const bitmap = await createImageBitmap(selected, { imageOrientation: 'from-image' });
      try {
        if (bitmap.width <= 0 || bitmap.height <= 0 || bitmap.width * bitmap.height > 16_700_000)
          throw new Error('Invalid photo dimensions');
        if (version !== photoVersion.current) return;
        setPhoto(selected);
        setPhotoStatus('ready');
      } finally {
        bitmap.close();
      }
    } catch {
      if (version === photoVersion.current) {
        setPhoto(undefined);
        setPhotoStatus('error');
      }
    }
  }

  useEffect(
    () => () => {
      photoVersion.current += 1;
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function generate(): Promise<void> {
      try {
        const [engine, client, { APPS }] = await Promise.all([
          import('@/lib/render/index'),
          import('@/lib/client/glyphs'),
          import('@/content/apps'),
        ]);
        const [selected, fill] = await Promise.all([
          client.loadGlyphs(controls.weight, controller.signal),
          client.loadGlyphs('fill', controller.signal),
        ]);
        if (controller.signal.aborted) return;
        const glyphs: GlyphSource = {
          get: (name, weight) => selected.get(name, weight) ?? fill.get(name, weight),
        };
        const phone = {
          w: 240,
          h: Math.round((engine.DEVICE_PRESETS.thumb.h * 240) / engine.DEVICE_PRESETS.thumb.w),
        };
        const preview = {
          w: 320,
          h: Math.round((engine.DEVICE_PRESETS.preview.h * 320) / engine.DEVICE_PRESETS.preview.w),
        };
        const items: TileData[] = WALLPAPER_KINDS.map((kind) => ({
          id: `wallpaper-${kind}`,
          group: 'wallpapers',
          title: t(`kinds.${kind}`),
          result: engine.renderWallpaper(
            makeSpec({ ...controls, kind }),
            'home',
            { ...phone, prefix: `lab-${kind}` },
            glyphs,
          ),
        }));
        const wallpaper = engine.renderWallpaper(
          spec,
          'home',
          { ...phone, prefix: 'lab-icon-wallpaper' },
          glyphs,
        );
        for (const platform of ['ios', 'shaped'] as const) {
          for (const fillStyle of fills) {
            items.push({
              id: `icon-${platform}-${fillStyle}`,
              group: 'icons',
              title: t('iconTitle', {
                fill: t(`fills.${fillStyle}`),
                platform: t(`platforms.${platform}`),
              }),
              result: engine.renderIcon(
                { ...spec.icons, fill: fillStyle },
                glyphs.get('heart', controls.weight),
                {
                  size: 192,
                  platform,
                  palette: spec.palette,
                  glyphs,
                  wallpaper,
                  prefix: `lab-${platform}-${fillStyle}`,
                },
              ),
            });
          }
        }
        for (const kind of widgets)
          items.push({
            id: `widget-${kind}`,
            group: 'widgets',
            title: t(`widgetKinds.${kind}`),
            result: engine.renderWidget(
              kind,
              spec,
              { w: 192, h: 192, prefix: `lab-${kind}` },
              glyphs,
            ),
          });
        items.push(
          {
            id: 'preview-home',
            group: 'previews',
            title: t('homePreview'),
            result: engine.renderHomePreview(spec, glyphs, APPS, {
              ...preview,
              prefix: 'lab-home',
            }),
          },
          {
            id: 'preview-lock',
            group: 'previews',
            title: t('lockPreview'),
            result: engine.renderLockPreview(spec, glyphs, { ...preview, prefix: 'lab-lock' }),
          },
        );
        if (!controller.signal.aborted) setBatch({ key, status: 'ready', items });
      } catch {
        if (!controller.signal.aborted) setBatch({ key, status: 'error' });
      }
    }
    void generate();
    return (): void => controller.abort();
  }, [controls, key, spec, t]);

  return (
    <Stack py={{ base: '8', md: '12' }} gap="8">
      <Stack gap="3" maxW="3xl">
        <Text textStyle="caption" color="brand.fg">
          {t('eyebrow')}
        </Text>
        <Heading as="h1" textStyle="display.xl">
          {t('title')}
        </Heading>
        <Text textStyle="body.md" color="fg.muted">
          {t('description')}
        </Text>
        <Badge alignSelf="start" colorPalette="brand">
          {t('activeSeed', { seed: formatNumber(controls.seed, locale, { useGrouping: false }) })}
        </Badge>
        {urlInvalid ? (
          <Text role="status" textStyle="body.sm" color="fg.muted">
            {t('invalidUrl')}
          </Text>
        ) : null}
      </Stack>

      <Box
        as="form"
        bg="bg.panel"
        p={{ base: '4', md: '6' }}
        rounded="card"
        borderWidth="hairline"
        borderColor="border"
        onSubmit={(event) => {
          event.preventDefault();
          applySeed();
        }}
      >
        <Stack gap="6">
          <Heading as="h2" textStyle="heading.md">
            {t('controls')}
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap="5">
            <SelectField
              id="render-palette"
              label={t('palette')}
              value={controls.palette}
              options={Object.keys(SAMPLE_PALETTES).map((value) => ({
                value,
                label: t(`palettes.${value as Controls['palette']}`),
              }))}
              onChange={(palette) => updateControls({ palette: palette })}
            />
            <SelectField
              id="render-kind"
              label={t('wallpaper')}
              value={controls.kind}
              options={WALLPAPER_KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }))}
              onChange={(kind) => updateControls({ kind: kind })}
            />
            <SelectField
              id="render-font"
              label={t('font')}
              value={controls.font}
              options={FONT_IDS.map((value) => ({ value, label: t(`fonts.${value}`) }))}
              onChange={(font) => updateControls({ font: font })}
            />
            <SelectField
              id="render-weight"
              label={t('weight')}
              value={controls.weight}
              options={GLYPH_WEIGHTS.map((value) => ({ value, label: t(`weights.${value}`) }))}
              onChange={(weight) => updateControls({ weight: weight })}
            />
            <SelectField
              id="render-pattern"
              label={t('pattern')}
              value={controls.pattern}
              options={PATTERNS.map((value) => ({ value, label: t(`patterns.${value}`) }))}
              onChange={(pattern) => updateControls({ pattern: pattern })}
            />
            <SelectField
              id="render-sky"
              label={t('sky')}
              value={controls.skyMode}
              options={skyModes.map((value) => ({ value, label: t(`skyModes.${value}`) }))}
              onChange={(skyMode) => updateControls({ skyMode: skyMode })}
            />
            <Field.Root invalid={seedInvalid}>
              <Field.Label htmlFor="render-seed">{t('seed')}</Field.Label>
              <Input
                id="render-seed"
                inputMode="numeric"
                dir="ltr"
                value={seedDraft}
                minH="11"
                onChange={(event) => {
                  setSeedDraft(event.currentTarget.value);
                  setSeedInvalid(false);
                }}
                aria-describedby={seedInvalid ? 'render-seed-error' : undefined}
              />
              {seedInvalid ? (
                <Field.ErrorText id="render-seed-error">{t('invalidSeed')}</Field.ErrorText>
              ) : null}
            </Field.Root>
            <Field.Root>
              <Field.Label htmlFor="render-grain">
                {t('grain', {
                  amount: formatNumber(controls.grain, locale, {
                    style: 'percent',
                    maximumFractionDigits: 0,
                  }),
                })}
              </Field.Label>
              <Input
                id="render-grain"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={controls.grain}
                minH="11"
                px="0"
                accentColor="brand.solid"
                onChange={(event) => updateControls({ grain: Number(event.currentTarget.value) })}
              />
            </Field.Root>
          </SimpleGrid>
          <HStack gap="3" flexWrap="wrap">
            <Button type="submit" colorPalette="brand" size="lg" minH="11">
              {t('applySeed')}
            </Button>
            <Button type="button" variant="outline" size="lg" minH="11" onClick={shuffle}>
              {t('shuffle')}
            </Button>
          </HStack>
          <Grid gap="3" borderTopWidth="hairline" borderColor="border" pt="5">
            <Field.Root invalid={photoStatus === 'error'}>
              <Field.Label htmlFor="render-photo">{t('photo')}</Field.Label>
              <Input
                ref={fileInput}
                id="render-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                minH="11"
                py="2"
                onChange={(event) => void choosePhoto(event)}
                aria-describedby="render-photo-hint"
              />
              <Field.HelperText id="render-photo-hint">{t('photoHint')}</Field.HelperText>
              {photoStatus === 'error' ? (
                <Field.ErrorText>{t('photoInvalid')}</Field.ErrorText>
              ) : null}
            </Field.Root>
            {photoStatus === 'loading' ? (
              <Text role="status" textStyle="body.sm">
                {t('checkingPhoto')}
              </Text>
            ) : null}
            {photo ? (
              <HStack gap="3" flexWrap="wrap">
                <Text role="status" dir="auto" textStyle="body.sm" overflowWrap="anywhere">
                  {t('photoReady', { name: photo.name })}
                </Text>
                <Button
                  type="button"
                  variant="ghost"
                  minH="11"
                  onClick={() => {
                    photoVersion.current += 1;
                    setPhoto(undefined);
                    setPhotoStatus(undefined);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  {t('removePhoto')}
                </Button>
              </HStack>
            ) : null}
          </Grid>
        </Stack>
      </Box>

      {!current ? (
        <Stack gap="4" aria-busy="true">
          <Text role="status" color="fg.muted">
            {t('loading')}
          </Text>
          <SimpleGrid columns={{ base: 2, md: 3, xl: 4 }} gap="4">
            {Array.from({ length: 9 }, (_, index) => (
              <Skeleton
                key={index}
                h="64"
                rounded="card"
                css={{ '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}
              />
            ))}
          </SimpleGrid>
        </Stack>
      ) : current.status === 'error' ? (
        <ErrorState code="RENDER_FAILED" onRetry={() => setAttempt((value) => value + 1)} />
      ) : (
        groups.map((group) => (
          <Stack as="section" key={group} gap="4">
            <Heading as="h2" textStyle="heading.md">
              {t(`sections.${group}`)}
            </Heading>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3, xl: 4 }} gap="4">
              {current.items
                .filter((item) => item.group === group)
                .map((item) => (
                  <RenderTile
                    key={item.id}
                    title={item.title}
                    filename={`${item.id}-${controls.palette}-${controls.seed}`}
                    result={item.result}
                    photo={photo}
                  />
                ))}
            </SimpleGrid>
          </Stack>
        ))
      )}
      <Text textStyle="caption" color="fg.muted">
        {common('brandName')} · {t('developmentOnly')}
      </Text>
    </Stack>
  );
}
