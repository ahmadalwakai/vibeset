'use client';

import {
  Box,
  Button,
  Flex,
  Grid,
  Spinner,
  Stack,
  Text,
  useBreakpointValue,
} from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { InAppBrowserBanner } from '@/components/common/InAppBrowserBanner';
import { toaster } from '@/components/ui/toaster';
import { useThemeEditor } from '@/hooks/useThemeEditor';
import { Link } from '@/i18n/navigation';
import { copyUrl, shareUrl } from '@/lib/client/share';
import { loadSetupTheme } from '@/lib/client/setup-theme';
import { track } from '@/lib/client/track';
import type { ThemeSpec } from '@/lib/render/spec';
import { STUDIO_PANELS } from '@/lib/studio';
import type {
  CreatorStudioOptions,
  StudioWorkspacePanel,
  StudioShareResult,
  ThemeEditor,
} from '@/lib/studio';
import type { StudioSavedIdentity, StudioSource } from '@/lib/studio-entry';
import type { ThemeExportSource } from '@/lib/theme-export';
import { localized } from '@/lib/utils/localized';
import { StudioPreview } from './StudioPreview';
import { StudioToolbar } from './StudioToolbar';
import { StudioPanels } from './StudioPanels';

function ExportLoading(): ReactElement {
  const t = useTranslations('studio');
  return (
    <Flex
      position="fixed"
      bottom="24"
      insetEnd="4"
      zIndex="modal"
      bg="bg.panel"
      rounded="card"
      p="4"
      gap="3"
      align="center"
      role="status"
    >
      <Spinner size="sm" />
      <Text>{t('loading')}</Text>
    </Flex>
  );
}
const WallpaperDownloadSheet = dynamic(
  () => import('@/components/theme/WallpaperDownloadSheet').then((m) => m.WallpaperDownloadSheet),
  { loading: ExportLoading },
);
const IconExportSheet = dynamic(
  () => import('@/components/theme/IconExportSheet').then((m) => m.IconExportSheet),
  { loading: ExportLoading },
);
const StudioSaveSheet = dynamic(() => import('./StudioSaveSheet').then((m) => m.StudioSaveSheet), {
  loading: ExportLoading,
});

interface StudioShellProps {
  initialSpec: ThemeSpec;
  sourceSlug: string | null;
  initialSource: StudioSource | null;
  initialRemix: StudioSavedIdentity | null;
  entryError: 'invalidLink' | 'themeUnavailable' | null;
  restored: boolean;
}

export function StudioShell(props: StudioShellProps): ReactElement {
  const editor = useThemeEditor(props.initialSpec, props.sourceSlug);
  return <StudioWorkspace {...props} editor={editor} />;
}

export function StudioWorkspace({
  sourceSlug,
  initialSource,
  initialRemix,
  entryError,
  restored,
  editor,
  creator,
}: Omit<StudioShellProps, 'initialSpec'> & {
  editor: ThemeEditor;
  creator?: CreatorStudioOptions;
}): ReactElement {
  const t = useTranslations('studio');
  const common = useTranslations('common');
  const locale = useLocale();
  const creatorText = useTranslations('creator.editor');
  const [panel, setPanel] = useState<StudioWorkspacePanel>(creator ? 'details' : 'colors');
  const panelValues: readonly StudioWorkspacePanel[] = creator
    ? [...STUDIO_PANELS, 'details']
    : STUDIO_PANELS;
  const panelLabel = (value: StudioWorkspacePanel): string =>
    value === 'details' ? creatorText('detailsPanel') : t(`panels.${value}`);
  const mobile = useBreakpointValue({ base: true, lg: false }) ?? false;
  const [panelOpen, setPanelOpen] = useState(false);
  const [download, setDownload] = useState(false);
  const [icons, setIcons] = useState(false);
  const [save, setSave] = useState(false);
  const [reset, setReset] = useState(false);
  const [opened, setOpened] = useState({ download: false, icons: false, save: false });
  const [source, setSource] = useState(initialSource);
  const [share, setShare] = useState<{ spec: ThemeSpec; result: StudioShareResult } | null>(null);
  const tracked = useRef(false);
  const pendingRemix = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const notified = useRef(false);
  const { spec } = editor;
  const exportSource: ThemeExportSource = { slug: 'studio-remix', spec };
  useEffect(() => {
    if (notified.current) return;
    const title = entryError
      ? t(`entry.${entryError}`)
      : restored
        ? t('entry.draftRestored')
        : null;
    if (!title) return;
    let active = true;
    // The toast store flushes synchronously; notify after React's effect lifecycle.
    queueMicrotask(() => {
      if (!active || notified.current) return;
      notified.current = true;
      toaster.create({ type: 'info', title });
    });
    return () => {
      active = false;
    };
  }, [entryError, restored, t]);
  useEffect(() => {
    if (!sourceSlug || initialSource) return;
    const controller = new AbortController();
    void loadSetupTheme(sourceSlug, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted)
          setSource({ id: value.id, slug: value.slug, nameEn: value.nameEn, nameAr: value.nameAr });
      })
      .catch(() => {
        /* The local design remains usable when its source is unavailable. */
      });
    return () => controller.abort();
  }, [sourceSlug, initialSource]);
  useEffect(() => {
    if (source && pendingRemix.current && !tracked.current) {
      tracked.current = true;
      track(source.id, 'remix');
    }
  }, [source]);
  useEffect(() => {
    let active = true;
    void import('@/lib/client/studio-share')
      .then((m) =>
        m.prepareStudioShareUrl(spec, {
          baseUrl: window.location.origin,
          locale: locale === 'ar' ? 'ar' : 'en',
        }),
      )
      .then((result) => {
        if (active) setShare({ spec, result });
      })
      .catch(() => {
        if (active) setShare({ spec, result: { ok: false, reason: 'invalid' } });
      });
    return () => {
      active = false;
    };
  }, [spec, locale]);
  function completed(): void {
    pendingRemix.current = true;
    if (!tracked.current && source) {
      tracked.current = true;
      track(source.id, 'remix');
    }
  }
  async function shareDesign(copyOnly = false): Promise<void> {
    if (share?.spec !== spec) {
      toaster.create({ type: 'info', title: t('share.preparing') });
      return;
    }
    if (!share.result.ok) {
      toaster.create({ type: 'info', title: t('share.saveFirst') });
      return;
    }
    try {
      const result = copyOnly
        ? (await copyUrl(share.result.url), 'copied' as const)
        : await shareUrl({ title: t('title'), url: share.result.url });
      if (result === 'shared' || result === 'copied')
        toaster.create({ type: 'success', title: t(`share.${result}`) });
      else if (result === 'activation-required')
        toaster.create({ type: 'info', title: t('share.activation') });
    } catch {
      toaster.create({ type: 'error', title: t('share.failed') });
    }
  }
  return (
    <Stack
      gap="5"
      pb={{ base: '16', lg: '0' }}
      inert={creator?.busy ? true : undefined}
      aria-busy={creator?.busy}
    >
      <InAppBrowserBanner />
      {source ? (
        <Text textStyle="body.sm" color="fg.muted">
          <Box asChild display="inline-flex" minH="11" alignItems="center">
            <Link href={`/t/${source.slug}`}>
              {t('sourceLabel', { name: localized(source, locale) })}
            </Link>
          </Box>
        </Text>
      ) : null}
      <StudioToolbar
        editor={editor}
        sharingReady={share?.spec === spec}
        onShare={() => void shareDesign()}
        onCopy={() => void shareDesign(true)}
        onSave={() => {
          if (creator) {
            creator.onSave();
            return;
          }
          editor.flushDraft();
          setOpened((v) => ({ ...v, save: true }));
          setSave(true);
        }}
        onDownload={() => {
          setOpened((v) => ({ ...v, download: true }));
          setDownload(true);
        }}
        onIcons={() => {
          setOpened((v) => ({ ...v, icons: true }));
          setIcons(true);
        }}
        onReset={() => setReset(true)}
        savePending={creator?.busy}
        saveDisabled={creator?.saveDisabled}
        saveLabel={creator ? creatorText('save') : undefined}
      />
      {creator?.actions}
      {editor.error ? (
        <Flex gap="3" align="center" role="alert">
          <Text textStyle="body.sm" color="red.fg">
            {t('editorError')}
          </Text>
          <Button variant="ghost" minH="11" onClick={editor.clearError}>
            {common('close')}
          </Button>
        </Flex>
      ) : null}
      <Grid
        templateColumns={{ base: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 22.5rem' }}
        gap="6"
        alignItems="start"
      >
        <Box
          ref={previewRef}
          position={{ lg: 'sticky' }}
          top={{ lg: '24' }}
          py="4"
          scrollMarginTop="16"
        >
          <StudioPreview spec={spec} />
        </Box>
        {!mobile ? (
          <Box
            minW="0"
            bg="bg.panel"
            borderWidth="hairline"
            borderColor="border"
            rounded="sheet"
            overflow="hidden"
          >
            <StudioPanels
              spec={spec}
              onChange={editor.dispatch}
              panel={panel}
              onPanelChange={setPanel}
              details={creator?.details}
              wallpaperTools={creator?.wallpaperTools}
            />
          </Box>
        ) : null}
      </Grid>
      {mobile ? (
        <>
          <Flex
            position="fixed"
            bottom={
              creator
                ? 'env(safe-area-inset-bottom, 0px)'
                : 'calc(4rem + env(safe-area-inset-bottom, 0px))'
            }
            insetStart="0"
            insetEnd="0"
            zIndex="sticky"
            p="2"
            gap="1"
            overflowX="auto"
            bg="bg.panel"
            borderTopWidth="hairline"
            borderColor="border"
            roundedTop="sheet"
            role="group"
            aria-label={t('title')}
          >
            {panelValues.map((value) => (
              <Button
                key={value}
                minH="11"
                flex="1"
                flexShrink="0"
                size="sm"
                variant={panel === value ? 'subtle' : 'ghost'}
                colorPalette="brand"
                aria-haspopup="dialog"
                aria-expanded={panelOpen && panel === value}
                onClick={() => {
                  previewRef.current?.scrollIntoView({ block: 'start' });
                  setPanel(value);
                  setPanelOpen(true);
                }}
              >
                {panelLabel(value)}
              </Button>
            ))}
          </Flex>
          <ResponsiveSheet open={panelOpen} onOpenChange={setPanelOpen} title={panelLabel(panel)}>
            <Box inert={creator?.busy ? true : undefined}>
              <StudioPanels
                spec={spec}
                onChange={editor.dispatch}
                panel={panel}
                onPanelChange={setPanel}
                details={creator?.details}
                wallpaperTools={creator?.wallpaperTools}
              />
            </Box>
          </ResponsiveSheet>
        </>
      ) : null}
      <ConfirmDialog
        open={reset}
        onOpenChange={setReset}
        title={t('toolbar.resetTitle')}
        description={t('toolbar.resetBody')}
        confirmLabel={t('toolbar.reset')}
        danger={false}
        onConfirm={() => editor.dispatch({ type: 'reset' })}
      />
      {opened.download ? (
        <WallpaperDownloadSheet
          theme={exportSource}
          open={download}
          onOpenChange={setDownload}
          onSaved={completed}
        />
      ) : null}
      {opened.icons ? (
        <IconExportSheet
          key={JSON.stringify(spec)}
          theme={exportSource}
          open={icons}
          onOpenChange={setIcons}
          onSaved={completed}
        />
      ) : null}
      {opened.save ? (
        <StudioSaveSheet
          spec={spec}
          initialRemix={initialRemix}
          sourceSlug={sourceSlug}
          open={save}
          onOpenChange={setSave}
          flushDraft={editor.flushDraft}
          onSaved={completed}
        />
      ) : null}
    </Stack>
  );
}
