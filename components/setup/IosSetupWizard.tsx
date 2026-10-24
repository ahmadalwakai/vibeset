'use client';

import {
  Box,
  Button,
  HStack,
  Icon,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { useAppCatalog } from '@/hooks/useAppCatalog';
import { Link } from '@/i18n/navigation';
import { defaultSelection } from '@/lib/client/icon-export-utils';
import { readIconSelection, reconcileIconSelection } from '@/lib/client/icon-selection';
import { loadGlyphManifest } from '@/lib/client/glyph-manifest';
import { loadSetupTheme } from '@/lib/client/setup-theme';
import { track } from '@/lib/client/track';
import { readWizardProgress, writeWizardProgress } from '@/lib/client/wizard-progress';
import type { AppDTO, ThemeDetailDTO } from '@/lib/dto';
import { ICON_SELECTION_KEY } from '@/lib/icon-export';
import type { IconSelection } from '@/lib/icon-export';
import { formatNumber } from '@/lib/utils/format';
import { exportSlugSchema } from '@/lib/validation/icon-export';
import { initialWizardState, wizardReducer, wizardSummary } from '@/lib/wizard-progress';
import { StepCard } from './StepCard';
import { StepMedia } from './StepMedia';
import { PlainAppGlyph } from './PlainAppGlyph';

const IconPreview = dynamic(
  () => import('@/components/theme/IconPreview').then((module) => module.IconPreview),
  { loading: () => <Skeleton boxSize="12" rounded="xl" /> },
);
interface WizardItem {
  id: string;
  label: string;
  glyph: string;
}

export function SetupWizardSkeleton(): ReactElement {
  return (
    <Stack gap="4" aria-hidden="true">
      <Skeleton h="8" w="2/3" />
      <Skeleton h="3" />
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} h="16" rounded="card" />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function WizardChecklist({
  items,
  slug,
  theme,
}: {
  items: WizardItem[];
  slug: string | null;
  theme: ThemeDetailDTO | null;
}): ReactElement {
  const t = useTranslations('setup');
  const locale = useLocale();
  const [state, dispatch] = useReducer(wizardReducer, items, (initial) =>
    initialWizardState(
      initial.map(({ id }) => id),
      readWizardProgress(slug),
    ),
  );
  const progress = wizardSummary(state);
  const [activeId, setActiveId] = useState<string | null>(progress.nextId);
  const [confirmReset, setConfirmReset] = useState(false);
  const claimed = useRef(state.completed);
  const active =
    items.find(({ id }) => id === activeId) ??
    items.find(({ id }) => id === progress.nextId) ??
    null;

  useEffect(() => {
    writeWizardProgress(slug, { ...state, completed: state.completed || claimed.current });
  }, [slug, state]);
  useEffect(() => {
    if (!progress.complete || state.completed || (slug && !theme)) return;
    const alreadyClaimed = claimed.current || readWizardProgress(slug)?.completed === true;
    claimed.current = true;
    writeWizardProgress(slug, { ...state, completed: true });
    dispatch({ type: 'claim-completion' });
    if (!alreadyClaimed && theme) track(theme.id, 'setup_complete');
  }, [progress.complete, slug, state, theme]);

  function markDone(): void {
    if (!active) return;
    const value = !state.done.includes(active.id);
    const next = wizardReducer(state, { type: 'done', id: active.id, value });
    dispatch({ type: 'done', id: active.id, value });
    if (value) setActiveId(wizardSummary(next).nextId);
  }
  const stepKeys = ['open', 'action', 'details', 'photo', 'name', 'finish'] as const;
  return (
    <Stack gap="6">
      <Progress.Root value={progress.percent} colorPalette="brand" size="sm">
        <Progress.Label aria-live="polite">
          {t('ios.progress', {
            done: formatNumber(progress.done, locale),
            total: formatNumber(progress.total, locale),
          })}
        </Progress.Label>
        <Progress.Track mt="3" rounded="full">
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      {progress.complete ? (
        <Stack gap="3" rounded="card" bg="brand.subtle" p="6" role="status">
          <Icon boxSize="10" color="brand.fg">
            <CheckCircleIcon weight="duotone" />
          </Icon>
          <Text as="h2" textStyle="heading.md">
            {t('ios.completeTitle')}
          </Text>
          <Text textStyle="body.md" color="fg.muted">
            {t('ios.completeBody')}
          </Text>
          {theme ? (
            <Button asChild size="lg" variant="outline" alignSelf="start">
              <Link href={`/t/${theme.slug}`}>{t('common.backTheme')}</Link>
            </Button>
          ) : null}
        </Stack>
      ) : null}
      <SimpleGrid
        templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 2fr)' }}
        gap="6"
        alignItems="start"
      >
        <Stack as="nav" aria-label={t('ios.title')} gap="2" maxH="96" overflowY="auto" p="1">
          {items.map((item) => (
            <Button
              key={item.id}
              variant={active?.id === item.id ? 'subtle' : 'outline'}
              colorPalette="brand"
              size="lg"
              h="auto"
              minH="16"
              py="2"
              px="3"
              justifyContent="start"
              textAlign="start"
              whiteSpace="normal"
              onClick={() => setActiveId(item.id)}
              aria-current={active?.id === item.id ? 'step' : undefined}
            >
              {theme ? (
                <IconPreview
                  spec={theme.spec}
                  glyph={item.glyph}
                  platform="ios"
                  label={item.label}
                />
              ) : (
                <PlainAppGlyph glyph={item.glyph} label={item.label} />
              )}
              <Text flex="1" minW="0" overflowWrap="anywhere">
                {item.label}
              </Text>
              {state.done.includes(item.id) ? (
                <Icon boxSize="5" color="brand.fg" aria-label={t('ios.markDone')}>
                  <CheckCircleIcon weight="fill" />
                </Icon>
              ) : null}
            </Button>
          ))}
        </Stack>
        {active ? (
          <Stack gap="4" minW="0">
            <Text as="h2" textStyle="heading.md">
              {t('ios.appHeading', { app: active.label })}
            </Text>
            <Button asChild colorPalette="brand" size="lg" alignSelf="start">
              <a href="shortcuts://create-shortcut">{t('ios.openShortcuts')}</a>
            </Button>
            <Text textStyle="body.sm" color="fg.muted">
              {t('ios.openFallback')}
            </Text>
            {stepKeys.map((step, index) => (
              <StepCard
                key={step}
                number={index + 1}
                headingLevel="h3"
                title={t(`ios.steps.${step}Title`)}
                media={<StepMedia step={step} label={t(`ios.steps.${step}Title`)} />}
              >
                <Text>{t(`ios.steps.${step}Body`, { app: active.label })}</Text>
              </StepCard>
            ))}
            <Button colorPalette="brand" size="lg" onClick={markDone}>
              {t(state.done.includes(active.id) ? 'ios.markUndone' : 'ios.markDone')}
            </Button>
          </Stack>
        ) : null}
      </SimpleGrid>
      <Button variant="ghost" size="lg" alignSelf="start" onClick={() => setConfirmReset(true)}>
        {t('ios.reset')}
      </Button>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('ios.resetTitle')}
        description={t('ios.resetBody')}
        confirmLabel={t('ios.reset')}
        onConfirm={() => {
          claimed.current = false;
          const next = wizardReducer(state, { type: 'reset' });
          writeWizardProgress(slug, next);
          dispatch({ type: 'reset' });
          setActiveId(items[0]?.id ?? null);
        }}
      />
    </Stack>
  );
}

function WizardBody({ slug, invalid }: { slug: string | null; invalid: boolean }): ReactElement {
  const t = useTranslations('setup');
  const common = useTranslations('common');
  const catalog = useAppCatalog();
  const [selection, setSelection] = useState<IconSelection | null>(null);
  const [theme, setTheme] = useState<ThemeDetailDTO | null>(null);
  const [themeError, setThemeError] = useState(invalid);
  const [themeLoading, setThemeLoading] = useState(Boolean(slug));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!slug) return () => controller.abort();
    void loadSetupTheme(slug, controller.signal)
      .then(
        (value) => {
          if (!controller.signal.aborted) setTheme(value);
        },
        () => {
          if (!controller.signal.aborted) {
            setTheme(null);
            setThemeError(true);
          }
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setThemeLoading(false);
      });
    return () => controller.abort();
  }, [slug, attempt]);
  useEffect(() => {
    if (catalog.loading || catalog.error) return;
    const controller = new AbortController();
    let validatedGlyphNames: readonly string[] | undefined;
    const hydrate = (glyphNames?: readonly string[]): void => {
      const stored = readIconSelection() ?? {
        v: 1 as const,
        appSlugs: defaultSelection(catalog.apps),
        custom: [],
      };
      setSelection(reconcileIconSelection(stored, catalog.apps, glyphNames));
    };
    hydrate();
    void loadGlyphManifest(controller.signal)
      .then((entries) => {
        if (!controller.signal.aborted) {
          validatedGlyphNames = entries.map(({ name }) => name);
          hydrate(validatedGlyphNames);
        }
      })
      .catch(() => {
        /* Retain stored customs while the manifest is unavailable. */
      });
    const storage = (event: StorageEvent): void => {
      if (event.key === ICON_SELECTION_KEY || event.key === null) hydrate(validatedGlyphNames);
    };
    window.addEventListener('storage', storage);
    return () => {
      controller.abort();
      window.removeEventListener('storage', storage);
    };
  }, [catalog.apps, catalog.loading, catalog.error]);
  const items = useMemo((): WizardItem[] => {
    if (!selection) return [];
    const apps = new Map<string, AppDTO>(catalog.apps.map((app) => [app.slug, app]));
    return [
      ...selection.appSlugs.flatMap((id) => {
        const app = apps.get(id);
        return app ? [{ id: `app:${id}`, label: app.name, glyph: app.glyph }] : [];
      }),
      ...selection.custom.map((item) => ({
        id: `custom:${item.id}`,
        label: item.label,
        glyph: item.glyph,
      })),
    ];
  }, [selection, catalog.apps]);
  if (catalog.error) return <ErrorState code={catalog.error} onRetry={catalog.retry} />;
  if (catalog.loading || !selection) return <SetupWizardSkeleton />;
  if (!items.length)
    return (
      <EmptyState
        title={t('ios.emptyTitle')}
        description={t('ios.emptyBody')}
        action={
          <Button asChild size="lg" colorPalette="brand">
            <Link href={theme ? `/t/${theme.slug}` : '/explore'}>{t('ios.chooseIcons')}</Link>
          </Button>
        }
      />
    );
  return (
    <Stack gap="6">
      {themeLoading ? <Skeleton h="6" w="2/3" /> : null}
      {themeError ? (
        <HStack align="start" gap="3" p="4" rounded="card" bg="bg.muted" flexWrap="wrap">
          <Box flex="1">
            <Text textStyle="body.sm">{t('ios.themeUnavailable')}</Text>
            <Text textStyle="body.sm" color="fg.muted">
              {t('ios.withoutTheme')}
            </Text>
          </Box>
          {slug ? (
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setThemeLoading(true);
                setThemeError(false);
                setAttempt((value) => value + 1);
              }}
            >
              {common('retry')}
            </Button>
          ) : null}
        </HStack>
      ) : null}
      <WizardChecklist
        key={`${slug ?? 'default'}:${items.map(({ id }) => id).join(',')}`}
        items={items}
        slug={slug}
        theme={theme}
      />
    </Stack>
  );
}

export function IosSetupWizard(): ReactElement {
  const params = useSearchParams();
  const raw = params.get('theme');
  const parsed = exportSlugSchema.safeParse(raw);
  const slug = params.getAll('theme').length === 1 && parsed.success ? parsed.data : null;
  const invalid = params.has('theme') && !slug;
  return <WizardBody key={`${slug ?? 'default'}:${invalid}`} slug={slug} invalid={invalid} />;
}
