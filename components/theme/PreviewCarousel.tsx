'use client';

import {
  Box,
  Button,
  Flex,
  Icon,
  IconButton,
  Image,
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ImageBrokenIcon } from '@phosphor-icons/react/dist/csr/ImageBroken';
import { useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import type { ThemeDetailDTO } from '@/lib/dto';
import { formatNumber } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';

function PreviewImage({
  src,
  alt,
  priority,
}: {
  src: string | null;
  alt: string;
  priority: boolean;
}): ReactElement {
  const t = useTranslations('theme');
  const common = useTranslations('common');
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imageRef = useCallback((node: HTMLImageElement | null): void => {
    // A cached image can finish before hydration attaches its load/error handlers.
    if (!node?.complete) return;
    if (node.naturalWidth > 0) setLoaded(true);
    else setFailed(true);
  }, []);

  if (!src || failed)
    return (
      <Stack position="absolute" inset="0" align="center" justify="center" gap="3" p="6">
        <Icon asChild boxSize="8" color="fg.muted">
          <ImageBrokenIcon aria-hidden />
        </Icon>
        <Text textStyle="body.sm" color="fg.muted" textAlign="center">
          {t('previewUnavailable')}
        </Text>
        {src ? (
          <Button
            variant="outline"
            rounded="button"
            minH="11"
            onClick={() => {
              setLoaded(false);
              setFailed(false);
            }}
          >
            {common('retry')}
          </Button>
        ) : null}
      </Stack>
    );

  return (
    <>
      {!loaded ? (
        <Skeleton
          position="absolute"
          inset="0"
          role="img"
          aria-busy="true"
          aria-label={t('preview.loading')}
        />
      ) : null}
      <Image
        ref={imageRef}
        position="absolute"
        inset="0"
        src={src}
        alt={alt}
        width={360}
        height={780}
        w="full"
        h="full"
        objectFit="cover"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}

export function PreviewCarousel({ theme }: { theme: ThemeDetailDTO }): ReactElement {
  const t = useTranslations('theme.preview');
  const locale = useLocale();
  const name = localized(theme, locale);
  const reduced = useReducedMotion();
  const id = useId();
  const strip = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const slides = [
    { key: 'home', src: theme.previewHomeUrl, alt: t('homeAlt', { name }), label: t('home') },
    { key: 'lock', src: theme.previewLockUrl, alt: t('lockAlt', { name }), label: t('lock') },
  ] as const;

  function move(index: number): void {
    const target = Math.max(0, Math.min(slides.length - 1, index));
    strip.current?.children[target]?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'start',
    });
    setActive(target);
  }

  function updateActive(): void {
    const node = strip.current;
    if (!node) return;
    const viewport = node.getBoundingClientRect();
    const center = (viewport.left + viewport.right) / 2;
    let nearest = 0;
    let distance = Infinity;
    Array.from(node.children).forEach((child, index) => {
      const bounds = child.getBoundingClientRect();
      const candidate = Math.abs((bounds.left + bounds.right) / 2 - center);
      if (candidate < distance) {
        nearest = index;
        distance = candidate;
      }
    });
    setActive(nearest);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = slides.length - 1;
    else if (event.key === 'ArrowRight') next = active + (locale === 'ar' ? -1 : 1);
    else if (event.key === 'ArrowLeft') next = active + (locale === 'ar' ? 1 : -1);
    else return;
    event.preventDefault();
    move(next);
  }

  return (
    <Stack
      role="region"
      aria-roledescription={t('carousel')}
      aria-label={t('label')}
      gap="3"
      w="full"
      maxW="sm"
      mx="auto"
    >
      <Flex
        ref={strip}
        id={id}
        tabIndex={0}
        aria-label={t('label')}
        overflowX="auto"
        scrollSnapType="x mandatory"
        rounded="card"
        focusRing="inside"
        onScroll={updateActive}
        onKeyDown={onKeyDown}
        css={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
      >
        {slides.map((slide, index) => (
          <Box
            key={slide.key}
            role="group"
            aria-roledescription={t('slide')}
            aria-label={slide.label}
            flex="0 0 100%"
            minW="0"
            scrollSnapAlign="start"
            dir="ltr"
          >
            <Box
              position="relative"
              aspectRatio={9 / 19.5}
              overflow="hidden"
              rounded="card"
              bg={theme.dominantColor ?? 'bg.muted'}
            >
              <PreviewImage
                key={slide.src}
                src={slide.src}
                alt={slide.alt}
                priority={index === 0}
              />
            </Box>
          </Box>
        ))}
      </Flex>
      <Stack align="center" gap="0">
        <Text textStyle="body.sm" color="fg.muted" aria-live="polite" aria-atomic="true">
          {slides[active]?.label}
        </Text>
        <Flex align="center" justify="center" gap="1" role="group" aria-label={t('label')}>
          {slides.map((slide, index) => (
            <IconButton
              key={slide.key}
              variant="ghost"
              rounded="full"
              minW="11"
              minH="11"
              aria-label={index === 0 ? t('showHome') : t('showLock')}
              aria-controls={id}
              aria-pressed={active === index}
              onClick={() => move(index)}
            >
              <Box
                boxSize="2.5"
                rounded="full"
                bg={active === index ? 'brand.solid' : 'border.emphasized'}
              />
            </IconButton>
          ))}
        </Flex>
        <Text textStyle="caption" color="fg.muted">
          {t('position', {
            current: formatNumber(active + 1, locale),
            total: formatNumber(slides.length, locale),
          })}
        </Text>
      </Stack>
    </Stack>
  );
}
