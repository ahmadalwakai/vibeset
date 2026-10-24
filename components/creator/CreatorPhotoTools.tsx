'use client';

import { Box, Button, Image, SimpleGrid, Skeleton, Stack, Text } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { toaster } from '@/components/ui/toaster';
import { env } from '@/lib/env.client';
import type { IconStyle, ThemeSpec } from '@/lib/render/spec';
import type { ThemeEditor, WallpaperTarget } from '@/lib/studio';
import type { FinalizedWallpaperUpload } from '@/lib/uploads';
import { focalFromKey, focalFromPointer } from './photo-tools-state';
import type { FocalPoint } from './photo-tools-state';

const WallpaperUploader = dynamic(
  () => import('./WallpaperUploader').then((module) => module.WallpaperUploader),
  { loading: (): ReactElement => <Skeleton h="32" /> },
);
const IconPreview = dynamic(
  () => import('@/components/theme/IconPreview').then((module) => module.IconPreview),
  { loading: (): ReactElement => <Skeleton boxSize="12" rounded="input" /> },
);

function PhotoFocalPicker({
  assetKey,
  focalX,
  focalY,
  onChange,
}: {
  assetKey: string;
  focalX: number;
  focalY: number;
  onChange: (point: FocalPoint) => void;
}): ReactElement {
  const t = useTranslations('creator.editor'),
    common = useTranslations('common');
  const hintId = useId();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const readImage = useCallback((node: HTMLImageElement | null): void => {
    if (!node?.complete) return;
    if (node.naturalWidth > 0 && node.naturalHeight > 0)
      setSize({ width: node.naturalWidth, height: node.naturalHeight });
    else setFailed(true);
  }, []);
  const src = new URL(assetKey, `${env.NEXT_PUBLIC_CDN_URL.replace(/\/$/, '')}/`).href;
  return (
    <Stack gap="3">
      <Text id={hintId} textStyle="caption" color="fg.muted">
        {t('focalHint')}
      </Text>
      {failed ? (
        <Stack gap="3" role="alert">
          <Text textStyle="body.sm" color="red.fg">
            {t('photoPreviewFailed')}
          </Text>
          <Button
            minH="11"
            variant="outline"
            onClick={() => {
              setFailed(false);
              setSize(null);
              setAttempt((value) => value + 1);
            }}
          >
            {common('retry')}
          </Button>
        </Stack>
      ) : (
        <>
          <Box
            asChild
            position="relative"
            aspectRatio={size ? size.width / size.height : 9 / 16}
            overflow="hidden"
            rounded="input"
            bg="bg.subtle"
            display="block"
            w="full"
            maxW="64"
            minH="11"
            minW="11"
            mx="auto"
            p="0"
            borderWidth="0"
            focusRing="outside"
          >
            <button
              type="button"
              dir="ltr"
              aria-label={t('focalLabel')}
              aria-describedby={hintId}
              disabled={!size}
              onClick={(event) => {
                if (!event.detail || !size) return;
                const point = focalFromPointer(
                  event.clientX,
                  event.clientY,
                  event.currentTarget.getBoundingClientRect(),
                );
                if (point) onChange(point);
              }}
              onKeyDown={(event) => {
                const point = focalFromKey(event.key, { focalX, focalY });
                if (point) {
                  event.preventDefault();
                  onChange(point);
                }
              }}
            >
              <Image
                key={attempt}
                ref={readImage}
                src={src}
                alt=""
                width={size?.width ?? 1080}
                height={size?.height ?? 1920}
                position="absolute"
                inset="0"
                w="full"
                h="full"
                objectFit="contain"
                opacity={size ? 1 : 0}
                decoding="async"
                onLoad={(event) => {
                  const node = event.currentTarget;
                  if (node.naturalWidth > 0 && node.naturalHeight > 0)
                    setSize({ width: node.naturalWidth, height: node.naturalHeight });
                }}
                onError={() => setFailed(true)}
              />
              {size ? (
                <Box
                  position="absolute"
                  insetStart={`${focalX * 100}%`}
                  top={`${focalY * 100}%`}
                  transform="translate(-50%, -50%)"
                  boxSize="5"
                  rounded="full"
                  bg="brand.solid"
                  borderWidth="hairline"
                  borderColor="brand.contrast"
                  pointerEvents="none"
                />
              ) : (
                <Skeleton position="absolute" inset="0" h="full" />
              )}
            </button>
          </Box>
          {!size ? (
            <Text textStyle="caption" color="fg.muted" role="status">
              {common('loading')}
            </Text>
          ) : (
            <Text textStyle="caption" color="fg.muted" role="status">
              {t('focalPosition', { x: Math.round(focalX * 100), y: Math.round(focalY * 100) })}
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}

export function CreatorPhotoTools({
  editor,
  target,
  onPendingChange,
}: {
  editor: ThemeEditor;
  target: WallpaperTarget;
  onPendingChange: (pending: boolean) => void;
}): ReactElement {
  const t = useTranslations('creator.editor'),
    errors = useTranslations('errors'),
    common = useTranslations('common');
  const [processing, setProcessing] = useState(false),
    [applyFailed, setApplyFailed] = useState(false),
    [suggestionsFailed, setSuggestionsFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [suggestions, setSuggestions] = useState<{
    palette: ThemeSpec['palette'];
    icons: IconStyle;
    attempt: number;
    values: IconStyle[];
  } | null>(null);
  const mounted = useRef(false),
    epoch = useRef(0),
    uploadPending = useRef(false),
    uploadTarget = useRef(target),
    processingPending = useRef(false),
    callbacks = useRef({ editor, target, onPendingChange }),
    ready = useRef<{ data: FinalizedWallpaperUpload; target: WallpaperTarget } | null>(null);
  useEffect(() => {
    callbacks.current = { editor, target, onPendingChange };
  }, [editor, target, onPendingChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
      callbacks.current.onPendingChange(false);
    };
  }, []);
  const handlePending = useCallback((value: boolean): void => {
    if (!mounted.current) return;
    if (value) {
      epoch.current += 1;
      uploadTarget.current = callbacks.current.target;
      ready.current = null;
      setApplyFailed(false);
    }
    uploadPending.current = value;
    callbacks.current.onPendingChange(value || processingPending.current);
  }, []);
  const applyPhoto = useCallback(
    async (data: FinalizedWallpaperUpload, destination: WallpaperTarget): Promise<void> => {
      const sequence = ++epoch.current;
      ready.current = { data, target: destination };
      processingPending.current = true;
      setProcessing(true);
      setApplyFailed(false);
      callbacks.current.onPendingChange(true);
      const current = (): boolean => mounted.current && epoch.current === sequence;
      try {
        const [paletteHelper, iconHelper] = await Promise.all([
          import('@/lib/render/photo-palette'),
          import('@/lib/render/photo-icons'),
        ]);
        if (!current()) return;
        const palette = paletteHelper.derivePhotoPalette(data.palette);
        const [icons] = iconHelper.photoIconSuggestions(
          palette,
          callbacks.current.editor.spec.icons,
        );
        callbacks.current.editor.dispatch({
          type: 'setPhotoWallpaper',
          assetKey: data.assetKey,
          target: destination,
          palette,
          ...(icons ? { icons } : {}),
        });
        toaster.create({ type: 'success', title: t('photoPaletteApplied') });
      } catch {
        if (current()) setApplyFailed(true);
      } finally {
        if (current()) {
          processingPending.current = false;
          setProcessing(false);
          callbacks.current.onPendingChange(uploadPending.current);
        }
      }
    },
    [t],
  );
  const uploaded = useCallback(
    (data: FinalizedWallpaperUpload): void => {
      if (mounted.current) void applyPhoto(data, uploadTarget.current);
    },
    [applyPhoto],
  );
  const spec = editor.spec;
  const wallpaper = target === 'lock' ? (spec.lockWallpaper ?? spec.wallpaper) : spec.wallpaper;
  useEffect(() => {
    let active = true;
    void import('@/lib/render/photo-icons')
      .then((module) => {
        if (active) {
          setSuggestions({
            palette: spec.palette,
            icons: spec.icons,
            attempt,
            values: module.photoIconSuggestions(spec.palette, spec.icons),
          });
          setSuggestionsFailed(false);
        }
      })
      .catch(() => {
        if (active) setSuggestionsFailed(true);
      });
    return () => {
      active = false;
    };
  }, [spec.palette, spec.icons, attempt]);
  const currentSuggestions =
    suggestions?.palette === spec.palette &&
    suggestions.icons === spec.icons &&
    suggestions.attempt === attempt
      ? suggestions.values
      : null;
  const previews = useMemo(
    () => currentSuggestions?.map((icons) => ({ ...spec, icons })) ?? [],
    [spec, currentSuggestions],
  );
  function focal(point: FocalPoint): void {
    if (wallpaper.kind === 'image')
      editor.dispatch({ type: 'patchWallpaper', target, control: 'photo-focal', patch: point });
  }
  return (
    <Stack gap="4" mb="6" pb="6" borderBottomWidth="hairline" borderColor="border">
      <Text as="h3" textStyle="heading.sm">
        {t('photoOption')}
      </Text>
      <WallpaperUploader
        onUploaded={uploaded}
        disabled={processing}
        onPendingChange={handlePending}
      />
      {processing ? (
        <Text textStyle="body.sm" color="fg.muted" role="status">
          {common('loading')}
        </Text>
      ) : null}
      {applyFailed ? (
        <Stack gap="3" role="alert">
          <Text textStyle="body.sm" color="red.fg">
            {errors('INTERNAL')}
          </Text>
          <Button
            minH="11"
            variant="outline"
            onClick={() => {
              const value = ready.current;
              if (value) void applyPhoto(value.data, value.target);
            }}
          >
            {common('retry')}
          </Button>
        </Stack>
      ) : null}
      {wallpaper.kind === 'image' ? (
        <>
          <PhotoFocalPicker
            key={`${target}:${wallpaper.assetKey}`}
            assetKey={wallpaper.assetKey}
            focalX={wallpaper.focalX}
            focalY={wallpaper.focalY}
            onChange={focal}
          />
          <Text as="h4" textStyle="body.sm" fontWeight="medium">
            {t('suggestions')}
          </Text>
          {suggestionsFailed ? (
            <Stack gap="3" role="alert">
              <Text textStyle="body.sm" color="red.fg">
                {t('photoSuggestionsFailed')}
              </Text>
              <Button
                minH="11"
                variant="outline"
                onClick={() => {
                  setSuggestionsFailed(false);
                  setAttempt((value) => value + 1);
                }}
              >
                {common('retry')}
              </Button>
            </Stack>
          ) : !currentSuggestions ? (
            <Skeleton h="24" rounded="input" />
          ) : (
            <SimpleGrid columns={{ base: 1, sm: 3 }} gap="3">
              {previews.map((preview, index) => (
                <Stack key={preview.icons.fill} align="center" gap="2">
                  <IconPreview spec={preview} glyph="sparkle" platform="shaped" label="" />
                  <Button
                    minH="11"
                    variant="outline"
                    onClick={() =>
                      editor.dispatch({
                        type: 'patchIcons',
                        patch: preview.icons,
                        control: 'photo-suggestion',
                      })
                    }
                  >
                    {t('applySuggestion', { number: index + 1 })}
                  </Button>
                </Stack>
              ))}
            </SimpleGrid>
          )}
        </>
      ) : null}
    </Stack>
  );
}
