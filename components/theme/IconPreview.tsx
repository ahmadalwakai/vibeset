'use client';

import { Box, Icon, Image, Skeleton } from '@chakra-ui/react';
import { ImageBrokenIcon } from '@phosphor-icons/react/dist/csr/ImageBroken';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { IconRenderContext } from '@/lib/icon-export';
import type { ThemeSpec } from '@/lib/render/spec';

const contexts = new WeakMap<ThemeSpec, Promise<IconRenderContext>>();

function getContext(spec: ThemeSpec): Promise<IconRenderContext> {
  const cached = contexts.get(spec);
  if (cached) return cached;
  const request = import('@/lib/client/icon-export').then(({ prepareIconRenderContext }) =>
    prepareIconRenderContext({ spec }),
  );
  contexts.set(spec, request);
  void request.catch(() => {
    if (contexts.get(spec) === request) contexts.delete(spec);
  });
  return request;
}

export interface IconPreviewProps {
  spec: ThemeSpec;
  glyph: string;
  platform: 'ios' | 'shaped';
  label: string;
}

export function IconPreview({ spec, glyph, platform, label }: IconPreviewProps): ReactElement {
  const t = useTranslations('theme.icons');
  const box = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
    spec: ThemeSpec;
    glyph: string;
    platform: 'ios' | 'shaped';
    url: string | null;
  } | null>(null);
  const current =
    result?.spec === spec && result.glyph === glyph && result.platform === platform ? result : null;

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const controller = new AbortController();
    let url: string | null = null;
    let started = false;
    async function render(): Promise<void> {
      if (started || controller.signal.aborted) return;
      started = true;
      try {
        const [context, renderer, rasterizer] = await Promise.all([
          getContext(spec),
          import('@/lib/client/icon-export'),
          import('@/lib/client/rasterize'),
        ]);
        if (controller.signal.aborted) return;
        const output = renderer.renderIconPreview({ context, glyph, platform, size: 64 });
        const blob = await rasterizer.rasterizeInBrowser(output, {
          w: 64,
          h: 64,
          type: 'image/png',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setResult({ spec, glyph, platform, url });
      } catch {
        if (!controller.signal.aborted) setResult({ spec, glyph, platform, url: null });
      }
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                void render();
              }
            },
            { rootMargin: '160px' },
          );
    if (observer) observer.observe(node);
    else void render();
    return () => {
      controller.abort();
      observer?.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [spec, glyph, platform]);

  return (
    <Box
      ref={box}
      position="relative"
      aspectRatio={1}
      overflow="hidden"
      rounded="input"
      bg="bg.muted"
      boxSize="12"
      flexShrink="0"
      dir="ltr"
    >
      {current?.url ? (
        <Image
          src={current.url}
          alt={label}
          width={64}
          height={64}
          w="full"
          h="full"
          decoding="async"
        />
      ) : current ? (
        <Box
          display="grid"
          placeItems="center"
          h="full"
          role="img"
          aria-label={t('previewUnavailable')}
          aria-hidden={!label || undefined}
        >
          <Icon asChild boxSize="5" color="fg.muted">
            <ImageBrokenIcon aria-hidden />
          </Icon>
        </Box>
      ) : (
        <Skeleton position="absolute" inset="0" aria-hidden />
      )}
    </Box>
  );
}
