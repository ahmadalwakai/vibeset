'use client';

import {
  Box,
  Button,
  Checkbox,
  Flex,
  Icon,
  Image,
  Progress,
  SimpleGrid,
  Skeleton,
  Spinner,
  Stack,
  Steps,
  Text,
} from '@chakra-ui/react';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { PopIn } from '@/components/common/motion';
import { toaster } from '@/components/ui/toaster';
import { useAppCatalog } from '@/hooks/useAppCatalog';
import { usePlatform } from '@/hooks/usePlatform';
import { Link } from '@/i18n/navigation';
import { defaultSelection } from '@/lib/client/icon-export-utils';
import { loadGlyphManifest } from '@/lib/client/glyph-manifest';
import {
  readIconSelection,
  reconcileIconSelection,
  writeIconSelection,
} from '@/lib/client/icon-selection';
import { canShareFiles } from '@/lib/client/platform';
import type { PlatformInfo } from '@/lib/client/platform';
import { chunk, downloadFile, IOS_SHARE_BATCH, shareFiles } from '@/lib/client/share';
import { track } from '@/lib/client/track';
import type { AppDTO, ThemeDetailDTO } from '@/lib/dto';
import type { IconSelection } from '@/lib/icon-export';
import { iconSelectionSchema } from '@/lib/validation/icon-export';
import { formatNumber } from '@/lib/utils/format';
import { AppPicker } from './AppPicker';
import {
  iconExportReducer,
  INITIAL_ICON_EXPORT_STATE,
  resolveExportSelection,
} from './icon-export-state';
import type { IconExportState } from './icon-export-state';

export interface IconExportSheetProps {
  theme: ThemeDetailDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function GeneratedPreview({ file, index }: { file: File; index: number }): ReactElement {
  const t = useTranslations('theme.icons');
  const imageRef = useCallback(
    (node: HTMLImageElement | null): (() => void) | undefined => {
      if (!node) return;
      const url = URL.createObjectURL(file);
      node.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );
  const image = (
    <Box position="relative" aspectRatio={1} overflow="hidden" rounded="input" bg="bg.muted">
      <Image
        ref={imageRef}
        alt={t('generatedAlt', { name: file.name })}
        width={512}
        height={512}
        position="absolute"
        inset="0"
        w="full"
        h="full"
        objectFit="contain"
        loading={index < 6 ? 'eager' : 'lazy'}
        decoding="async"
      />
    </Box>
  );
  return index < 12 ? <PopIn>{image}</PopIn> : image;
}

function SaveIcons({
  state,
  theme,
  platform,
  onSaved,
  onEdit,
}: {
  state: IconExportState;
  theme: ThemeDetailDTO;
  platform: PlatformInfo;
  onSaved: (batch: number) => void;
  onEdit: () => void;
}): ReactElement {
  const t = useTranslations('theme.icons');
  const common = useTranslations('common');
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const [pendingBatch, setPendingBatch] = useState<number | null>(null);
  const saving = pendingBatch !== null;
  const [attempt, setAttempt] = useState(0);
  const [prepareZip, setPrepareZip] = useState(platform.platform !== 'ios');
  const [zip, setZip] = useState<{ attempt: number; file: File | null } | null>(null);
  const zipCurrent = zip?.attempt === attempt ? zip : null;
  const batches = chunk(state.files, IOS_SHARE_BATCH);
  const iosShare = platform.platform === 'ios' && batches.every((batch) => canShareFiles(batch));
  const { files } = state;

  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!prepareZip) return;
    const controller = new AbortController();
    void import('@/lib/client/zip')
      .then(({ zipFiles }) =>
        zipFiles(files, { name: `vibeset-${theme.slug}-icons.zip`, signal: controller.signal }),
      )
      .then((file) => {
        if (!controller.signal.aborted) setZip({ attempt, file });
      })
      .catch(() => {
        if (!controller.signal.aborted) setZip({ attempt, file: null });
      });
    return () => controller.abort();
  }, [files, theme.slug, attempt, prepareZip]);

  async function saveImages(batch: File[], index: number): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setPendingBatch(index);
    try {
      // The files are already prepared: native sharing runs within this tap.
      const result = await shareFiles(batch);
      if (result === 'saved' && mounted.current) {
        onSaved(index);
        toaster.create({ type: 'success', title: t('batchSaved') });
      } else if (result === 'activation-required' && mounted.current)
        toaster.create({ type: 'info', title: t('activationRequired') });
    } catch {
      if (mounted.current) toaster.create({ type: 'error', title: t('saveFailed') });
    } finally {
      pending.current = false;
      if (mounted.current) setPendingBatch(null);
    }
  }

  function saveZip(): void {
    if (!zipCurrent?.file || pending.current) return;
    try {
      downloadFile(zipCurrent.file);
      onSaved(-1);
      toaster.create({ type: 'success', title: t('downloadStarted') });
    } catch {
      toaster.create({ type: 'error', title: t('saveFailed') });
    }
  }

  return (
    <Stack gap="5">
      <Text as="h3" ref={heading} tabIndex={-1} textStyle="heading.sm">
        {t('finished', { count: formatNumber(files.length, locale) })}
      </Text>
      <SimpleGrid columns={{ base: 4, sm: 6 }} gap="2">
        {files.map((file, index) => (
          <GeneratedPreview key={file.name} file={file} index={index} />
        ))}
      </SimpleGrid>
      {iosShare ? (
        <Stack gap="3">
          <Text textStyle="body.sm" color="fg.muted">
            {t('iosSaveHint')}
          </Text>
          {batches.map((batch, index) => {
            const from = formatNumber(index * IOS_SHARE_BATCH + 1, locale);
            const to = formatNumber(index * IOS_SHARE_BATCH + batch.length, locale);
            const saved = state.savedBatches.includes(index);
            return (
              <Button
                key={index}
                colorPalette="brand"
                variant={saved ? 'outline' : 'solid'}
                size="lg"
                rounded="button"
                disabled={saving}
                loading={pendingBatch === index}
                onClick={() => void saveImages(batch, index)}
              >
                {saved ? (
                  <Icon asChild boxSize="5">
                    <CheckIcon aria-hidden />
                  </Icon>
                ) : null}
                {t(saved ? 'saveAgainRange' : 'saveRange', { from, to })}
              </Button>
            );
          })}
        </Stack>
      ) : platform.platform === 'ios' ? (
        <Text textStyle="body.sm" color="fg.muted" role="status">
          {t('iosUnsupported')}
        </Text>
      ) : null}
      {!prepareZip ? (
        <Button variant="outline" minH="11" onClick={() => setPrepareZip(true)}>
          {t('prepareZip')}
        </Button>
      ) : (
        <>
          {!zipCurrent ? (
            <Flex align="center" gap="3" role="status">
              <Spinner size="sm" color="brand.fg" />
              <Text textStyle="body.sm" color="fg.muted">
                {t('preparingZip')}
              </Text>
            </Flex>
          ) : !zipCurrent.file ? (
            <Stack gap="2" role="alert">
              <Text textStyle="body.sm" color="fg.muted">
                {t('zipError')}
              </Text>
              <Button variant="outline" minH="11" onClick={() => setAttempt((value) => value + 1)}>
                {common('retry')}
              </Button>
            </Stack>
          ) : null}
          <Button
            colorPalette="brand"
            variant={iosShare ? 'outline' : 'solid'}
            size="lg"
            rounded="button"
            disabled={!zipCurrent?.file || saving}
            onClick={saveZip}
          >
            <Icon asChild boxSize="5">
              <DownloadSimpleIcon aria-hidden />
            </Icon>
            {t('downloadZip')}
          </Button>
        </>
      )}
      {platform.platform === 'android' && canShareFiles([...files]) ? (
        <Button
          variant="outline"
          size="lg"
          disabled={saving}
          loading={pendingBatch === -2}
          onClick={() => void saveImages([...files], -2)}
        >
          {t('shareImages')}
        </Button>
      ) : null}
      {state.savedBatches.length ? (
        <Button asChild colorPalette="brand" variant="subtle" size="lg">
          <Link
            href={
              platform.platform === 'ios'
                ? { pathname: '/setup/ios', query: { theme: theme.slug } }
                : platform.platform === 'android'
                  ? '/setup/android'
                  : '/setup/desktop'
            }
          >
            {t(
              platform.platform === 'ios'
                ? 'setUpIos'
                : platform.platform === 'android'
                  ? 'setUpAndroid'
                  : 'setUpDesktop',
            )}
          </Link>
        </Button>
      ) : (
        <Text textStyle="body.sm" color="fg.muted">
          {t('saveFirst')}
        </Text>
      )}
      <Button variant="ghost" minH="11" disabled={saving} onClick={onEdit}>
        {t('editSelection')}
      </Button>
    </Stack>
  );
}

function ExportFlow({
  theme,
  apps,
  platform,
}: {
  theme: ThemeDetailDTO;
  apps: readonly AppDTO[];
  platform: PlatformInfo;
}): ReactElement {
  const t = useTranslations('theme.icons');
  const locale = useLocale();
  const [selection, setSelection] = useState<IconSelection>(() =>
    reconcileIconSelection(
      readIconSelection() ?? { v: 1, appSlugs: defaultSelection(apps), custom: [] },
      apps,
    ),
  );
  const [decor, setDecor] = useState(false);
  const [glyphNames, setGlyphNames] = useState<readonly string[] | null>(null);
  const [glyphError, setGlyphError] = useState(false);
  const [glyphAttempt, setGlyphAttempt] = useState(0);
  const [state, dispatch] = useReducer(iconExportReducer, INITIAL_ICON_EXPORT_STATE);
  const controller = useRef<AbortController | null>(null);
  const run = useRef(0);
  const tracked = useRef(false);
  const heading = useRef<HTMLParagraphElement>(null);
  const resolved = resolveExportSelection(selection, apps, glyphNames ?? undefined);
  const selectedApps = resolved.apps;
  const customCount = selection.custom.length;
  const checkingCustom = customCount > 0 && !glyphNames;
  const total = selectedApps.length + resolved.selection.custom.length + (decor ? 4 : 0);
  const step = state.phase === 'pick' ? 0 : state.phase === 'save' ? 2 : 1;
  const photoFallback =
    theme.spec.icons.fill === 'wallpaper' && theme.spec.wallpaper.kind === 'image';

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    writeIconSelection(selection);
  }, [selection]);
  useEffect(() => {
    if (!customCount) return;
    const request = new AbortController();
    void loadGlyphManifest(request.signal)
      .then((entries) => {
        if (request.signal.aborted) return;
        const names = entries.map(({ name }) => name);
        setGlyphNames(names);
        setGlyphError(false);
        setSelection((previous) => resolveExportSelection(previous, apps, names).selection);
      })
      .catch(() => {
        if (!request.signal.aborted) setGlyphError(true);
      });
    return () => request.abort();
  }, [apps, customCount, glyphAttempt]);
  useEffect(() => {
    if (state.phase === 'generating' || state.phase === 'error') heading.current?.focus();
  }, [state.phase]);

  function updateSelection(candidate: IconSelection): void {
    const parsed = iconSelectionSchema.safeParse(candidate);
    if (!parsed.success) return;
    setSelection(parsed.data);
    writeIconSelection(parsed.data);
  }

  async function generate(): Promise<void> {
    if (!total || checkingCustom || (controller.current && !controller.current.signal.aborted))
      return;
    const current = new AbortController();
    controller.current = current;
    const id = ++run.current;
    tracked.current = false;
    writeIconSelection(resolved.selection);
    dispatch({ type: 'start', run: id, total });
    try {
      const { exportIcons } = await import('@/lib/client/icon-export');
      const files = await exportIcons({
        slug: theme.slug,
        spec: theme.spec,
        apps: selectedApps,
        custom: resolved.selection.custom,
        platform: platform.platform === 'ios' ? 'ios' : 'shaped',
        signal: current.signal,
        decor,
        onProgress: ({ completed }) => dispatch({ type: 'progress', run: id, completed }),
        onWarning: (warning) => dispatch({ type: 'warning', run: id, warning }),
      });
      if (!current.signal.aborted) dispatch({ type: 'complete', run: id, files });
    } catch {
      if (!current.signal.aborted) dispatch({ type: 'fail', run: id });
    } finally {
      if (controller.current === current) controller.current = null;
    }
  }

  function cancel(): void {
    controller.current?.abort();
    controller.current = null;
    dispatch({ type: 'cancel', run: state.run });
    toaster.create({ type: 'info', title: t('cancelled') });
  }
  function saved(batch: number): void {
    if (!tracked.current) {
      tracked.current = true;
      track(theme.id, 'icon_export');
    }
    dispatch({ type: 'saved', run: state.run, batch });
  }

  return (
    <Stack gap="5" pb="4">
      <Steps.Root step={step} count={3} size="sm" colorPalette="brand">
        <Steps.List>
          {(['pick', 'generate', 'save'] as const).map((key, index) => (
            <Steps.Item key={key} index={index}>
              <Steps.Indicator>
                <Steps.Number />
              </Steps.Indicator>
              <Steps.Title textStyle="caption">{t(`steps.${key}`)}</Steps.Title>
              <Steps.Separator />
            </Steps.Item>
          ))}
        </Steps.List>
      </Steps.Root>
      {(photoFallback && state.phase === 'pick') || state.warnings.length ? (
        <Stack gap="2" rounded="input" bg="bg.subtle" p="3" role="status">
          {(state.phase === 'pick' ? (['photo-wallpaper-fallback'] as const) : state.warnings).map(
            (warning) => (
              <Text key={warning} textStyle="body.sm" color="fg.muted">
                {t(`warnings.${warning}`)}
              </Text>
            ),
          )}
        </Stack>
      ) : null}
      {state.phase === 'pick' ? (
        <>
          <AppPicker
            apps={apps}
            selection={selection}
            onSelectionChange={updateSelection}
            theme={theme}
            platform={platform.platform === 'ios' ? 'ios' : 'shaped'}
          />
          <Checkbox.Root
            checked={decor}
            onCheckedChange={({ checked }) => setDecor(checked === true)}
            minH="11"
            colorPalette="brand"
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label textStyle="body.sm">{t('widgetDecor.label')}</Checkbox.Label>
          </Checkbox.Root>
          <Text textStyle="caption" color="fg.muted">
            {t('widgetDecor.description')}
          </Text>
          {checkingCustom ? (
            glyphError ? (
              <Stack gap="2" role="alert">
                <Text textStyle="body.sm" color="fg.muted">
                  {t('glyph.error')}
                </Text>
                <Button
                  variant="outline"
                  minH="11"
                  onClick={() => {
                    setGlyphError(false);
                    setGlyphAttempt((value) => value + 1);
                  }}
                >
                  {t('retry')}
                </Button>
              </Stack>
            ) : (
              <Text textStyle="body.sm" color="fg.muted" role="status">
                {t('custom.checking')}
              </Text>
            )
          ) : null}
          {!total ? (
            <Text textStyle="body.sm" color="fg.muted" role="status">
              {t('noneSelected')}
            </Text>
          ) : null}
          <Button
            colorPalette="brand"
            size="lg"
            rounded="button"
            disabled={!total || checkingCustom}
            onClick={() => void generate()}
          >
            {t('generate')}
          </Button>
        </>
      ) : state.phase === 'save' ? (
        <SaveIcons
          key={state.run}
          state={state}
          theme={theme}
          platform={platform}
          onSaved={saved}
          onEdit={() => dispatch({ type: 'edit', run: state.run })}
        />
      ) : (
        <Stack gap="4" role={state.phase === 'error' ? 'alert' : 'status'}>
          <Text ref={heading} tabIndex={-1} textStyle="heading.sm">
            {t(state.phase === 'error' ? 'errorTitle' : 'working')}
          </Text>
          <Progress.Root
            value={state.completed}
            max={Math.max(1, state.total)}
            colorPalette="brand"
          >
            <Progress.Label aria-live="polite">
              {t('progress', {
                completed: formatNumber(state.completed, locale),
                total: formatNumber(state.total, locale),
              })}
            </Progress.Label>
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          {state.phase === 'error' ? (
            <>
              <Text textStyle="body.sm" color="fg.muted">
                {t('errorDescription')}
              </Text>
              <Button colorPalette="brand" size="lg" onClick={() => void generate()}>
                {t('retry')}
              </Button>
              <Button
                variant="ghost"
                minH="11"
                onClick={() => dispatch({ type: 'edit', run: state.run })}
              >
                {t('back')}
              </Button>
            </>
          ) : (
            <Button variant="outline" minH="11" onClick={cancel}>
              {t('cancel')}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function CatalogContent({
  theme,
  platform,
}: {
  theme: ThemeDetailDTO;
  platform: PlatformInfo;
}): ReactElement {
  const t = useTranslations('theme.icons');
  const common = useTranslations('common');
  const { apps, loading, error, retry } = useAppCatalog();
  if (loading)
    return (
      <Stack gap="3" role="status" aria-label={t('loadingCatalogue')}>
        <Skeleton h="11" />
        <SimpleGrid columns={3} gap="2" aria-hidden>
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} h="24" rounded="input" />
          ))}
        </SimpleGrid>
      </Stack>
    );
  if (error)
    return (
      <Stack gap="3" role="alert">
        <Text textStyle="body.sm" color="fg.muted">
          {t('catalogueUnavailable')}
        </Text>
        <Button minH="11" variant="outline" onClick={retry}>
          {common('retry')}
        </Button>
      </Stack>
    );
  return <ExportFlow theme={theme} apps={apps} platform={platform} />;
}

export function IconExportSheet({ theme, open, onOpenChange }: IconExportSheetProps): ReactElement {
  const t = useTranslations('theme.icons');
  const platform = usePlatform();
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
    >
      {open && platform ? (
        <CatalogContent key={theme.id} theme={theme} platform={platform} />
      ) : null}
    </ResponsiveSheet>
  );
}
