'use client';

import { Box, Button, Field, Icon, NativeSelect, Spinner, Stack, Text } from '@chakra-ui/react';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { toaster } from '@/components/ui/toaster';
import { usePlatform } from '@/hooks/usePlatform';
import { Link } from '@/i18n/navigation';
import { canShareFiles } from '@/lib/client/platform';
import type { PlatformInfo } from '@/lib/client/platform';
import {
  createWallpaperOptions,
  prepareWallpaper,
  screenDimensions,
} from '@/lib/client/generated-wallpaper';
import { chooseSaveStrategy, downloadFile, shareFiles } from '@/lib/client/share';
import { track } from '@/lib/client/track';
import { chooseWallpaperSize } from '@/lib/client/wallpaper';
import type { ThemeDetailDTO } from '@/lib/dto';
import { formatNumber } from '@/lib/utils/format';
import type { WallpaperDimensions, WallpaperSize } from '@/lib/wallpaper-export';

export interface WallpaperDownloadSheetProps {
  theme: ThemeDetailDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Preparation = { key: string; status: 'ready'; file: File } | { key: string; status: 'error' };

function currentScreen(): WallpaperDimensions | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return screenDimensions({
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio,
    });
  } catch {
    return undefined;
  }
}

function WallpaperDownloadBody({
  theme,
  platform,
}: {
  theme: ThemeDetailDTO;
  platform: PlatformInfo;
}): ReactElement {
  const t = useTranslations('theme.download');
  const locale = useLocale();
  const selectId = useId();
  const [screenSize, setScreenSize] = useState(currentScreen);
  const options = useMemo(
    () =>
      createWallpaperOptions({
        spec: theme.spec,
        wallpapers: theme.wallpapers,
        screen: screenSize,
      }),
    [theme.spec, theme.wallpapers, screenSize],
  );
  const [size, setSize] = useState<WallpaperSize>(
    () => chooseWallpaperSize(theme.wallpapers, platform)?.size ?? 'desktop4k',
  );
  const [attempt, setAttempt] = useState(0);
  const [prepared, setPrepared] = useState<Preparation | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activationRequired, setActivationRequired] = useState(false);
  const sequence = useRef(0);
  const pending = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(false);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const selected =
    options.find((item) => (item.kind === 'cdn' ? item.asset.size : item.size) === size) ??
    options[0];
  const details = selected?.kind === 'cdn' ? selected.asset : selected;
  const key = JSON.stringify([
    theme.id,
    theme.slug,
    selected,
    selected?.kind === 'render' ? theme.spec : null,
    attempt,
  ]);
  const file = prepared?.key === key && prepared.status === 'ready' ? prepared.file : null;
  const failed = prepared?.key === key && prepared.status === 'error';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const resize = (): void => {
      const next = currentScreen();
      setScreenSize((previous) =>
        previous?.w === next?.w && previous?.h === next?.h ? previous : next,
      );
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, []);

  useEffect(() => {
    if (saved) successHeading.current?.focus();
  }, [saved]);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++sequence.current;
    if (selected) {
      void prepareWallpaper({
        slug: theme.slug,
        spec: theme.spec,
        option: selected,
        signal: controller.signal,
      })
        .then((file) => {
          if (!controller.signal.aborted && sequence.current === id)
            setPrepared({ key, status: 'ready', file });
        })
        .catch(() => {
          if (!controller.signal.aborted && sequence.current === id)
            setPrepared({ key, status: 'error' });
        });
    }
    return () => {
      sequence.current += 1;
      controller.abort();
    };
  }, [key, theme.slug, theme.spec, selected]);

  async function save(): Promise<void> {
    if (!file || pending.current || completed.current) return;
    pending.current = true;
    setSaving(true);
    setActivationRequired(false);
    try {
      // shareFiles invokes navigator.share before its first await, preserving the tap.
      let result: Awaited<ReturnType<typeof shareFiles>>;
      if (chooseSaveStrategy(platform.platform, canShareFiles([file])) === 'share')
        result = await shareFiles([file]);
      else {
        downloadFile(file);
        result = 'saved';
      }
      if (result === 'saved' && !completed.current) {
        completed.current = true;
        track(theme.id, 'download');
      }
      if (!mounted.current) return;
      if (result === 'saved') setSaved(true);
      if (result === 'activation-required') {
        setActivationRequired(true);
        toaster.create({ type: 'info', title: t('errors.activation') });
      }
    } catch {
      if (mounted.current) toaster.create({ type: 'error', title: t('errors.save') });
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  if (!selected || !details)
    return (
      <Text py="4" role="status" color="fg.muted">
        {t('noSizes')}
      </Text>
    );
  if (saved) {
    const steps =
      platform.platform === 'ios'
        ? [t('iosSteps.open'), t('iosSteps.share'), t('iosSteps.apply')]
        : platform.platform === 'android'
          ? [t('androidSteps.open'), t('androidSteps.apply')]
          : [t('desktopSteps.mac'), t('desktopSteps.windows')];
    return (
      <Stack gap="5" pb="4" role="status">
        <Icon asChild boxSize="8" color="brand.fg">
          <CheckCircleIcon weight="duotone" aria-hidden />
        </Icon>
        <Text as="h3" ref={successHeading} tabIndex={-1} textStyle="heading.sm">
          {t('savedTitle')}
        </Text>
        <Stack as="ol" gap="3" ps="5" textStyle="body.sm" color="fg.muted">
          {steps.map((step) => (
            <Box as="li" key={step}>
              {step}
            </Box>
          ))}
        </Stack>
        {platform.platform === 'ios' ? (
          <Button asChild variant="outline" size="lg">
            <Link href="/setup/ios">{t('iosSetupLink')}</Link>
          </Button>
        ) : null}
      </Stack>
    );
  }

  const strategy = file ? chooseSaveStrategy(platform.platform, canShareFiles([file])) : 'download';
  return (
    <Stack gap="5" pb="4">
      <Field.Root>
        <Field.Label htmlFor={selectId}>{t('sizeLabel')}</Field.Label>
        <NativeSelect.Root size="lg" disabled={saving}>
          <NativeSelect.Field
            id={selectId}
            value={details.size}
            onChange={(event) => {
              const option = options.find(
                (item) =>
                  (item.kind === 'cdn' ? item.asset.size : item.size) === event.target.value,
              );
              if (option) {
                setSize(option.kind === 'cdn' ? option.asset.size : option.size);
                setActivationRequired(false);
              }
            }}
          >
            {options.map((item) => {
              const size = item.kind === 'cdn' ? item.asset.size : item.size;
              return (
                <option key={size} value={size}>
                  {t(size)}
                </option>
              );
            })}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Field.HelperText>
          {t('dimensions', {
            w: formatNumber(details.w, locale),
            h: formatNumber(details.h, locale),
          })}
          {selected.kind === 'cdn' || file ? (
            <>
              {' '}
              {' · '}
              {t('fileSize', {
                size: formatNumber(
                  (selected.kind === 'cdn' ? selected.asset.bytes : (file?.size ?? 0)) / 1024,
                  locale,
                  {
                    style: 'unit',
                    unit: 'kilobyte',
                    maximumFractionDigits: 0,
                  },
                ),
              })}
            </>
          ) : null}
        </Field.HelperText>
      </Field.Root>
      {failed ? (
        <Stack gap="3" role="alert">
          <Text textStyle="body.sm" color="red.fg">
            {t(selected.kind === 'render' ? 'errors.render' : 'errors.network')}
          </Text>
          <Button variant="outline" size="lg" onClick={() => setAttempt((value) => value + 1)}>
            {t('retry')}
          </Button>
        </Stack>
      ) : !file ? (
        <Stack align="center" py="5" role="status" aria-live="polite" aria-busy="true">
          <Spinner color="brand.fg" size="lg" />
          <Text textStyle="body.sm" color="fg.muted">
            {t(selected.kind === 'render' ? 'rendering' : 'preparing')}
          </Text>
        </Stack>
      ) : null}
      {activationRequired ? (
        <Text role="alert" textStyle="body.sm" color="fg.muted">
          {t('errors.activation')}
        </Text>
      ) : null}
      <Button
        colorPalette="brand"
        size="lg"
        w="full"
        disabled={!file}
        loading={saving}
        onClick={() => {
          void save();
        }}
      >
        <Icon asChild boxSize="5">
          <DownloadSimpleIcon aria-hidden />
        </Icon>
        {strategy === 'share'
          ? t(platform.platform === 'ios' ? 'saveToPhotos' : 'shareFile')
          : t('downloadFile')}
      </Button>
    </Stack>
  );
}

export function WallpaperDownloadSheet({
  theme,
  open,
  onOpenChange,
}: WallpaperDownloadSheetProps): ReactElement {
  const t = useTranslations('theme.download');
  const platform = usePlatform();
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
    >
      {open && platform ? (
        <WallpaperDownloadBody
          key={JSON.stringify([theme.id, theme.spec, theme.wallpapers])}
          theme={theme}
          platform={platform}
        />
      ) : null}
    </ResponsiveSheet>
  );
}
