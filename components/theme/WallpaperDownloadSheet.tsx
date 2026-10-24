'use client';

import { Box, Button, Field, Icon, NativeSelect, Spinner, Stack, Text } from '@chakra-ui/react';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { toaster } from '@/components/ui/toaster';
import { usePlatform } from '@/hooks/usePlatform';
import { Link } from '@/i18n/navigation';
import { canShareFiles } from '@/lib/client/platform';
import type { PlatformInfo } from '@/lib/client/platform';
import { chooseSaveStrategy, downloadFile, shareFiles } from '@/lib/client/share';
import { track } from '@/lib/client/track';
import { chooseWallpaperSize, prepareWallpaperFile } from '@/lib/client/wallpaper';
import type { ThemeDetailDTO } from '@/lib/dto';
import { formatNumber } from '@/lib/utils/format';

export interface WallpaperDownloadSheetProps {
  theme: ThemeDetailDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Preparation = { key: string; status: 'ready'; file: File } | { key: string; status: 'error' };

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
  const [size, setSize] = useState(() => chooseWallpaperSize(theme.wallpapers, platform)?.size);
  const [attempt, setAttempt] = useState(0);
  const [prepared, setPrepared] = useState<Preparation | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activationRequired, setActivationRequired] = useState(false);
  const sequence = useRef(0);
  const pending = useRef(false);
  const completed = useRef(false);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const selected = theme.wallpapers.find((item) => item.size === size) ?? theme.wallpapers[0];
  const url = selected?.url;
  const width = selected?.w;
  const height = selected?.h;
  const bytes = selected?.bytes;
  const selectedSize = selected?.size;
  const key = JSON.stringify([
    theme.id,
    theme.slug,
    url,
    width,
    height,
    bytes,
    selectedSize,
    attempt,
  ]);
  const file = prepared?.key === key && prepared.status === 'ready' ? prepared.file : null;
  const failed = prepared?.key === key && prepared.status === 'error';

  useEffect(() => {
    if (saved) successHeading.current?.focus();
  }, [saved]);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++sequence.current;
    if (url && width && height && bytes && selectedSize) {
      void prepareWallpaperFile(
        theme.slug,
        { url, w: width, h: height, bytes, size: selectedSize },
        controller.signal,
      )
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
  }, [key, theme.slug, url, width, height, bytes, selectedSize]);

  async function save(): Promise<void> {
    if (!file || pending.current || completed.current) return;
    pending.current = true;
    const id = sequence.current;
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
      if (sequence.current !== id) return;
      if (result === 'saved') setSaved(true);
      if (result === 'activation-required') {
        setActivationRequired(true);
        toaster.create({ type: 'info', title: t('errors.activation') });
      }
    } catch {
      if (sequence.current === id) toaster.create({ type: 'error', title: t('errors.save') });
    } finally {
      pending.current = false;
      if (sequence.current === id) setSaving(false);
    }
  }

  if (!selected)
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
            value={selected.size}
            onChange={(event) => {
              const option = theme.wallpapers.find((item) => item.size === event.target.value);
              if (option) {
                setSize(option.size);
                setActivationRequired(false);
              }
            }}
          >
            {theme.wallpapers.map((item) => (
              <option key={item.size} value={item.size}>
                {t(item.size)}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Field.HelperText>
          {t('dimensions', {
            w: formatNumber(selected.w, locale),
            h: formatNumber(selected.h, locale),
          })}
          {' · '}
          {t('fileSize', {
            size: formatNumber(selected.bytes / 1024, locale, {
              style: 'unit',
              unit: 'kilobyte',
              maximumFractionDigits: 0,
            }),
          })}
        </Field.HelperText>
      </Field.Root>
      {failed ? (
        <Stack gap="3" role="alert">
          <Text textStyle="body.sm" color="red.fg">
            {t('errors.network')}
          </Text>
          <Button variant="outline" size="lg" onClick={() => setAttempt((value) => value + 1)}>
            {t('retry')}
          </Button>
        </Stack>
      ) : !file ? (
        <Stack align="center" py="5" role="status" aria-live="polite" aria-busy="true">
          <Spinner color="brand.fg" size="lg" />
          <Text textStyle="body.sm" color="fg.muted">
            {t('preparing')}
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
          key={JSON.stringify([theme.id, theme.wallpapers])}
          theme={theme}
          platform={platform}
        />
      ) : null}
    </ResponsiveSheet>
  );
}
