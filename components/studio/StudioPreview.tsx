'use client';

import {
  Box,
  Button,
  Flex,
  Image,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from '@chakra-ui/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { memo, useDeferredValue, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { PhoneFrame } from '@/components/theme/PhoneFrame';
import dynamic from 'next/dynamic';
import { useAppCatalog } from '@/hooks/useAppCatalog';
import type { AppDTO } from '@/lib/dto';
import type { StudioWallpaperPreview } from '@/lib/client/studio-preview';
import type { ThemeSpec } from '@/lib/render/spec';
import type { FontId } from '@/lib/render/types';

const fonts: Record<FontId, string> = {
  'readex-pro': 'var(--font-readex)',
  fraunces: 'var(--font-fraunces)',
  pacifico: 'var(--font-pacifico)',
  'space-grotesk': 'var(--font-space-grotesk)',
  'el-messiri': 'var(--font-el-messiri)',
  'jetbrains-mono': 'var(--font-jetbrains-mono)',
};
const StudioIconPreview = dynamic(
  () => import('./StudioIconPreview').then((module) => module.StudioIconPreview),
  { loading: () => <Skeleton h="48" w="full" /> },
);

const WallpaperSurface = memo(
  function WallpaperSurface({
    spec,
    which,
    onForeground,
  }: {
    spec: ThemeSpec;
    which: 'home' | 'lock';
    cacheKey: string;
    onForeground: (colour: string) => void;
  }): ReactElement {
    const t = useTranslations('studio.preview');
    const reduced = useReducedMotion();
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<StudioWallpaperPreview | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      const controller = new AbortController();
      const wallpaper = which === 'lock' ? (spec.lockWallpaper ?? spec.wallpaper) : spec.wallpaper;
      const timer = setTimeout(
        () => {
          void import('@/lib/client/studio-preview')
            .then((m) => m.prepareStudioWallpaperPreview(spec, which, controller.signal))
            .then((value) => {
              if (!controller.signal.aborted) {
                setResult(value);
                setFailed(false);
                onForeground(value.foreground);
              }
            })
            .catch(() => {
              if (!controller.signal.aborted) setFailed(true);
            });
        },
        wallpaper.kind === 'scatter' ? 120 : 0,
      );
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }, [spec, which, attempt, onForeground]);
    return (
      <Box position="absolute" inset="0" bg={spec.palette.bg}>
        <AnimatePresence initial={false}>
          {result ? (
            <motion.div
              key={result.src}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0.08 : 0.16 }}
              style={{ position: 'absolute', inset: 0 }}
            >
              <Image src={result.src} alt="" position="absolute" inset="0" w="full" h="full" />
              {result.noise ? (
                <Box
                  position="absolute"
                  inset="0"
                  backgroundImage={`url("${result.noise}")`}
                  mixBlendMode="soft-light"
                  pointerEvents="none"
                />
              ) : null}
            </motion.div>
          ) : (
            <Skeleton h="full" />
          )}
        </AnimatePresence>
        {failed ? (
          <Button
            position="absolute"
            bottom="4"
            insetStart="4"
            minH="11"
            size="sm"
            onClick={() => setAttempt((v) => v + 1)}
          >
            {t('retry')}
          </Button>
        ) : null}
      </Box>
    );
  },
  (a, b) => a.cacheKey === b.cacheKey,
);

const IconGrid = memo(
  function IconGrid({
    spec,
    apps,
  }: {
    spec: ThemeSpec;
    apps: readonly AppDTO[];
    cacheKey: string;
  }): ReactElement {
    const t = useTranslations('studio.preview');
    const [images, setImages] = useState<readonly string[]>([]);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      const controller = new AbortController();
      void Promise.all([import('@/lib/client/icon-export'), import('@/lib/render/svg')])
        .then(async ([engine, svg]) => {
          const context = await engine.prepareIconRenderContext({
            spec,
            signal: controller.signal,
          });
          controller.signal.throwIfAborted();
          const output = apps
            .slice(0, 16)
            .map((app) =>
              svg.svgDataUrl(
                engine.renderIconPreview({ context, glyph: app.glyph, platform: 'ios', size: 64 })
                  .svg,
              ),
            );
          if (!controller.signal.aborted) {
            setImages(output);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
      return () => controller.abort();
    }, [spec, apps, attempt]);
    const tile = (index: number): ReactElement =>
      images[index] ? (
        <Image
          src={images[index]}
          alt={apps[index]?.name ?? ''}
          w="full"
          aspectRatio="1"
          rounded="xl"
        />
      ) : (
        <Skeleton aspectRatio="1" rounded="xl" />
      );
    return (
      <>
        {failed ? (
          <Button
            position="absolute"
            top="45%"
            insetStart="10%"
            insetEnd="10%"
            size="sm"
            minH="11"
            pointerEvents="auto"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t('retry')}
          </Button>
        ) : null}
        <SimpleGrid position="absolute" top="37%" insetStart="7%" insetEnd="7%" columns={4} gap="3">
          {apps.slice(0, 16).map((app, index) => (
            <Stack key={app.slug} gap="1" minW="0" align="center">
              <Box w="3/4">{tile(index)}</Box>
              <Text fontSize="2xs" lineHeight="shorter" maxW="full" lineClamp="1">
                {app.name}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>
        <SimpleGrid
          position="absolute"
          bottom="5%"
          insetStart="5%"
          insetEnd="5%"
          columns={4}
          gap="3"
          p="2"
          rounded="2xl"
          bg="whiteAlpha.300"
        >
          {apps.slice(0, 4).map((app, index) => (
            <Box key={app.slug} minW="0">
              {tile(index)}
            </Box>
          ))}
        </SimpleGrid>
      </>
    );
  },
  (a, b) => a.cacheKey === b.cacheKey && a.apps === b.apps,
);

function DecorSymbols({ spec }: { spec: ThemeSpec }): ReactElement {
  const [symbols, setSymbols] = useState<{ key: string; images: string[] } | null>(null);
  const key = JSON.stringify([spec.decor, spec.icons.glyphWeight, spec.widgets.accent]);
  useEffect(() => {
    const controller = new AbortController();
    const [names, weight, color] = JSON.parse(key) as [
      string[],
      ThemeSpec['icons']['glyphWeight'],
      string,
    ];
    void import('@/lib/client/glyphs')
      .then((m) => m.loadGlyphs(weight, controller.signal))
      .then((source) => {
        if (controller.signal.aborted) return;
        const images = names
          .map((name) => source.get(name, weight))
          .filter((markup): markup is string => !!markup)
          .map(
            (markup) =>
              `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="${color}">${markup}</svg>`)}`,
          );
        setSymbols({ key, images });
      })
      .catch(() => {
        /* Decorative glyph failure does not hide the editable widget. */
      });
    return () => controller.abort();
  }, [key]);
  return (
    <Flex gap="1" aria-hidden>
      {symbols?.key === key
        ? symbols.images
            .slice(0, 6)
            .map((src, index) => <Image key={index} src={src} alt="" boxSize="5" />)
        : null}
    </Flex>
  );
}

export function StudioPreview({
  spec,
  showIcons = false,
}: {
  spec: ThemeSpec;
  showIcons?: boolean;
}): ReactElement {
  const t = useTranslations('studio.preview');
  const panels = useTranslations('studio.panels');
  const deferred = useDeferredValue(spec);
  const [which, setWhich] = useState<'home' | 'lock' | 'icons'>('home');
  const [foreground, setForeground] = useState(spec.palette.ink);
  const catalog = useAppCatalog();
  const wallpaper =
    which === 'lock' ? (deferred.lockWallpaper ?? deferred.wallpaper) : deferred.wallpaper;
  const wallpaperKey = JSON.stringify([deferred.palette, wallpaper, which]);
  const iconKey = JSON.stringify([
    deferred.palette,
    deferred.icons,
    deferred.icons.fill === 'wallpaper' ? deferred.wallpaper : null,
  ]);
  return (
    <Stack gap="4" align="center" aria-label={t('label')}>
      <Tabs.Root
        value={which}
        onValueChange={({ value }) => {
          if (value === 'home' || value === 'lock' || (showIcons && value === 'icons'))
            setWhich(value);
        }}
        variant="enclosed"
        size="sm"
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap="4"
        w="full"
      >
        <Tabs.List aria-label={t('label')}>
          <Tabs.Trigger minH="11" value="home">
            {t('home')}
          </Tabs.Trigger>
          <Tabs.Trigger minH="11" value="lock">
            {t('lock')}
          </Tabs.Trigger>
          {showIcons ? (
            <Tabs.Trigger minH="11" value="icons">
              {panels('icons')}
            </Tabs.Trigger>
          ) : null}
        </Tabs.List>
        <Tabs.Content value={which}>
          {which === 'icons' ? (
            <StudioIconPreview spec={deferred} />
          ) : (
            <PhoneFrame label={t(which)}>
              <WallpaperSurface
                spec={deferred}
                which={which}
                cacheKey={wallpaperKey}
                onForeground={setForeground}
              />
              <Box
                position="absolute"
                inset="0"
                pointerEvents="none"
                color={foreground}
                fontFamily={fonts[deferred.type.body]}
              >
                {wallpaper.kind === 'pattern' ? (
                  <Box
                    position="absolute"
                    top="0"
                    w="full"
                    h="10%"
                    bg={foreground === '\u0023ffffff' ? 'blackAlpha.600' : 'whiteAlpha.700'}
                  />
                ) : null}
                <Flex
                  position="absolute"
                  top="3%"
                  insetStart="7%"
                  insetEnd="7%"
                  justify="space-between"
                  align="center"
                  fontSize="xs"
                  fontWeight="semibold"
                >
                  <Text>{t('time')}</Text>
                  <Text aria-hidden>▴ ▰</Text>
                </Flex>
                {which === 'lock' ? (
                  <Stack
                    position="absolute"
                    top="15%"
                    w="full"
                    textAlign="center"
                    gap="0"
                    fontFamily={fonts[deferred.type.display]}
                  >
                    <Text fontSize="sm">{t('date')}</Text>
                    <Text fontSize="5xl" fontWeight="semibold" lineHeight="1.2">
                      {t('time')}
                    </Text>
                  </Stack>
                ) : (
                  <>
                    <Stack
                      position="absolute"
                      top="13%"
                      insetStart="7%"
                      insetEnd="7%"
                      h="19%"
                      justify="center"
                      px="4"
                      rounded={`${deferred.widgets.radius * 100}%`}
                      bg={
                        deferred.widgets.style === 'outline'
                          ? 'transparent'
                          : deferred.widgets.style === 'glass'
                            ? `color-mix(in srgb, ${deferred.widgets.surface} 72%, transparent)`
                            : deferred.widgets.surface
                      }
                      backgroundImage={
                        deferred.widgets.style === 'paper'
                          ? `repeating-linear-gradient(transparent 0 1rem, color-mix(in srgb, ${deferred.widgets.ink} 12%, transparent) 1rem 1.05rem)`
                          : undefined
                      }
                      backdropFilter={deferred.widgets.style === 'glass' ? 'blur(8px)' : undefined}
                      borderWidth={deferred.widgets.style === 'outline' ? 'medium' : '0'}
                      borderColor={deferred.widgets.ink}
                      color={deferred.widgets.ink}
                    >
                      <DecorSymbols spec={deferred} />
                      <Text
                        fontFamily={fonts[deferred.type.display]}
                        fontSize="lg"
                        fontWeight="semibold"
                        lineClamp="1"
                      >
                        {t('widgetTitle')}
                      </Text>
                      <Text fontSize="xs" color={deferred.widgets.accent} lineClamp="2">
                        {t('widgetBody')}
                      </Text>
                    </Stack>
                    <IconGrid spec={deferred} apps={catalog.apps} cacheKey={iconKey} />
                  </>
                )}
              </Box>
            </PhoneFrame>
          )}
        </Tabs.Content>
      </Tabs.Root>
      {catalog.error ? (
        <Button variant="ghost" minH="11" onClick={catalog.retry}>
          {t('retry')}
        </Button>
      ) : null}
    </Stack>
  );
}
