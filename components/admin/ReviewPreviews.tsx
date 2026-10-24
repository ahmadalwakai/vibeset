'use client';

import { Box, Button, Image, SimpleGrid, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useAppCatalog } from '@/hooks/useAppCatalog';
import type { ThemeSpec } from '@/lib/render/spec';

export function ReviewPreviews({ spec }: { spec: ThemeSpec }): ReactElement {
  const t = useTranslations('admin.review');
  const catalog = useAppCatalog();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ spec: ThemeSpec; urls: string[] | null } | null>(null);
  const current = result?.spec === spec ? result : null;
  useEffect(() => {
    if (catalog.loading || catalog.error) return;
    const controller = new AbortController();
    const urls: string[] = [];
    void (async (): Promise<void> => {
      try {
        if (!catalog.apps.length) throw new Error('App catalogue is empty');
        const [preview, icons, glyphs, rasterizer, wallpaper] = await Promise.all([
          import('@/lib/render/preview'),
          import('@/lib/render/icon'),
          import('@/lib/client/glyphs'),
          import('@/lib/client/rasterize'),
          import('@/lib/render/wallpaper'),
        ]);
        const weights = new Set([spec.icons.glyphWeight, 'fill' as const]);
        for (const value of [spec.wallpaper, spec.lockWallpaper])
          if (value?.kind === 'scatter') weights.add(value.weight);
        const sources = await Promise.all(
          [...weights].map((weight) => glyphs.loadGlyphs(weight, controller.signal)),
        );
        const source = sources[0];
        if (!source) throw new Error('No glyph source');
        const apps = [...catalog.apps].sort(
          (a, b) => a.rank - b.rank || a.slug.localeCompare(b.slug),
        );
        const background =
          spec.icons.fill === 'wallpaper'
            ? wallpaper.renderWallpaper(
                spec,
                'home',
                { w: 264, h: 572, prefix: 'review-icon-background' },
                source,
              )
            : undefined;
        const scenes = [
          preview.renderHomePreview(spec, source, apps, { w: 264, h: 572, prefix: 'review-home' }),
          preview.renderLockPreview(spec, source, { w: 264, h: 572, prefix: 'review-lock' }),
          ...apps.slice(0, 8).map((app) =>
            icons.renderIcon(spec.icons, source.get(app.glyph, spec.icons.glyphWeight), {
              size: 64,
              platform: 'ios',
              palette: spec.palette,
              glyphs: source,
              wallpaper: background,
              prefix: `review-${app.slug}`,
            }),
          ),
        ];
        for (const scene of scenes) {
          const blob = await rasterizer.rasterizeInBrowser(scene, {
            w: scene.width,
            h: scene.height,
            type: 'image/png',
            signal: controller.signal,
          });
          controller.signal.throwIfAborted();
          urls.push(URL.createObjectURL(blob));
        }
        if (!controller.signal.aborted) setResult({ spec, urls });
      } catch {
        if (!controller.signal.aborted) setResult({ spec, urls: null });
      }
    })();
    return () => {
      controller.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [spec, catalog.apps, catalog.loading, catalog.error, attempt]);
  const failed = catalog.error || current?.urls === null;
  return (
    <Stack gap="4" dir="ltr">
      {failed ? (
        <Stack role="alert" gap="3" align="center">
          <Text textStyle="body.sm" color="fg.muted">
            {t('previewFailed')}
          </Text>
          <Button
            minH="11"
            variant="outline"
            onClick={() => {
              if (catalog.error) catalog.retry();
              else {
                setResult(null);
                setAttempt((value) => value + 1);
              }
            }}
          >
            {t('retry')}
          </Button>
        </Stack>
      ) : (
        <>
          <SimpleGrid columns={2} gap={{ base: '2', md: '5' }} maxW="2xl" mx="auto" w="full">
            {(['home', 'lock'] as const).map((which, index) => (
              <Box
                key={which}
                position="relative"
                aspectRatio={264 / 572}
                overflow="hidden"
                rounded="card"
                bg="bg.subtle"
              >
                {current?.urls?.[index] ? (
                  <Image
                    src={current.urls[index]}
                    alt={t(`${which}Preview`)}
                    width={264}
                    height={572}
                    w="full"
                    h="full"
                    decoding="async"
                  />
                ) : (
                  <Skeleton position="absolute" inset="0" aria-label={t('loadingPreview')} />
                )}
              </Box>
            ))}
          </SimpleGrid>
          <SimpleGrid
            columns={8}
            gap="1"
            maxW="2xl"
            w="full"
            mx="auto"
            aria-label={t('iconsPreview')}
          >
            {Array.from({ length: 8 }, (_, index) => (
              <Box
                key={index}
                position="relative"
                aspectRatio={1}
                overflow="hidden"
                rounded="input"
                bg="bg.subtle"
              >
                {current?.urls?.[index + 2] ? (
                  <Image
                    src={current.urls[index + 2]}
                    alt=""
                    width={64}
                    height={64}
                    w="full"
                    h="full"
                    decoding="async"
                  />
                ) : (
                  <Skeleton position="absolute" inset="0" />
                )}
              </Box>
            ))}
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}
