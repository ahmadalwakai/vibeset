'use client';

import { Badge, Box, Button, Heading, Image, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { RenderResult } from '@/lib/render/types';
import { formatNumber } from '@/lib/utils/format';

interface RenderTileProps {
  title: string;
  filename: string;
  result: RenderResult;
  photo?: Blob;
}

type TileState = {
  result: RenderResult;
  photo: Blob | undefined;
  attempt: number;
} & ({ status: 'ready'; url: string } | { status: 'error' });

function needsPhoto(result: RenderResult): boolean {
  return Boolean(result.background || result.layers?.some((layer) => needsPhoto(layer.result)));
}

export function RenderTile({ title, filename, result, photo }: RenderTileProps): ReactElement {
  const t = useTranslations('studio.renderPlayground');
  const common = useTranslations('common');
  const locale = useLocale();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<TileState>();
  const missingPhoto = needsPhoto(result) && !photo;
  const current =
    state?.result === result && state.photo === photo && state.attempt === attempt
      ? state
      : undefined;

  useEffect(() => {
    if (missingPhoto) return;
    const controller = new AbortController();
    let url: string | undefined;
    async function render(): Promise<void> {
      try {
        // Yield before decoding to keep control changes responsive across the tile grid.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (controller.signal.aborted) return;
        const { rasterizeInBrowser } = await import('@/lib/client/rasterize');
        const blob = await rasterizeInBrowser(result, {
          w: Math.round(result.width),
          h: Math.round(result.height),
          type: 'image/png',
          signal: controller.signal,
          ...(photo ? { focalBackground: photo } : {}),
        });
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setState({ result, photo, attempt, status: 'ready', url });
      } catch {
        if (!controller.signal.aborted) setState({ result, photo, attempt, status: 'error' });
      }
    }
    void render();
    return (): void => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [attempt, missingPhoto, photo, result]);

  return (
    <Stack
      as="article"
      gap="3"
      p="4"
      bg="card.bg"
      rounded="card"
      borderWidth="hairline"
      borderColor="border"
      minW="0"
    >
      <Heading as="h3" textStyle="heading.sm">
        {title}
      </Heading>
      <Box
        dir="ltr"
        position="relative"
        aspectRatio={result.width / result.height}
        rounded="input"
        bg="bg.muted"
        overflow="hidden"
        aria-busy={!missingPhoto && !current}
      >
        {missingPhoto ? (
          <Stack
            dir="auto"
            h="full"
            minH="40"
            justify="center"
            align="center"
            p="4"
            textAlign="center"
          >
            <Text textStyle="body.sm" color="fg.muted">
              {t('photoEmpty')}
            </Text>
            <Button asChild size="lg" variant="outline" minH="11">
              <a href="#render-photo">{t('choosePhoto')}</a>
            </Button>
          </Stack>
        ) : current?.status === 'error' ? (
          <Stack
            dir="auto"
            h="full"
            minH="40"
            justify="center"
            align="center"
            p="4"
            textAlign="center"
            role="alert"
          >
            <Text textStyle="body.sm">{t('renderError')}</Text>
            <Button
              size="lg"
              minH="11"
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {common('retry')}
            </Button>
          </Stack>
        ) : current?.status === 'ready' ? (
          <Image
            src={current.url}
            alt={t('imageAlt', { title })}
            width={result.width}
            height={result.height}
            w="full"
            h="full"
            objectFit="contain"
            decoding="async"
          />
        ) : (
          <Skeleton
            w="full"
            h="full"
            minH="40"
            aria-label={t('rendering')}
            css={{ '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}
          />
        )}
      </Box>
      {result.warnings.length ? (
        <Badge alignSelf="start" colorPalette="orange">
          {t('warnings', { count: formatNumber(result.warnings.length, locale) })}
        </Badge>
      ) : null}
      {current?.status === 'ready' ? (
        <Button asChild size="lg" minH="11" variant="outline">
          <a href={current.url} download={`${filename}.png`}>
            {t('download')}
          </a>
        </Button>
      ) : (
        <Button size="lg" minH="11" variant="outline" disabled>
          {t('download')}
        </Button>
      )}
    </Stack>
  );
}
