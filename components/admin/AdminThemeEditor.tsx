'use client';

import { Badge, Box, Button, Field, Flex, Stack, Tabs, Text, Textarea } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { StudioWorkspace } from '@/components/studio/StudioShell';
import { toaster } from '@/components/ui/toaster';
import { useThemeEditor } from '@/hooks/useThemeEditor';
import { Link, useRouter } from '@/i18n/navigation';
import type { AdminThemeEditorDTO, AdminThemeOptions } from '@/lib/admin';
import {
  adminDetailsFromTheme,
  adminEditorInputsEqual,
  adminEditorTransitions,
} from '@/lib/admin-theme-editor';
import { themeSpecSchema } from '@/lib/render/spec';
import type { ErrorMessageCode } from '@/lib/result';
import type { ThemeStatus } from '@/lib/theme-status';
import { adminTransitionThemesSchema, adminUpdateThemeSchema } from '@/lib/validation/admin-themes';
import { adminTransitionThemes, adminUpdateTheme } from '@/server/actions/admin/themes';
import { submitTheme } from '@/server/actions/creator';
import { AdminAuditEntries } from './AdminAuditEntries';
import { AdminMetadataPanel } from './AdminMetadataPanel';
import { DownloadsChart } from './DownloadsChart';
import { usePublishQueue } from './PublishQueueProvider';

type EditorTab = 'visual' | 'details' | 'json' | 'history' | 'stats';
const tabs: readonly EditorTab[] = ['visual', 'details', 'json', 'history', 'stats'];
export function AdminThemeEditor({
  theme,
  options,
  actor,
}: {
  theme: AdminThemeEditorDTO;
  options: AdminThemeOptions;
  actor: { userId: string; isCreator: boolean };
}): ReactElement {
  const t = useTranslations('admin.editor'),
    actions = useTranslations('admin.themes'),
    statusLabel = useTranslations('creator.status'),
    creator = useTranslations('creator.editor'),
    errors = useTranslations('errors');
  const router = useRouter(),
    queue = usePublishQueue();
  const [mutating, setMutating] = useState(false),
    [refreshing, startRefresh] = useTransition(),
    [details, setDetails] = useState(() => adminDetailsFromTheme(theme));
  const busy = mutating || refreshing;
  const editor = useThemeEditor(theme.spec, null, false, busy);
  const [tab, setTab] = useState<EditorTab>('visual'),
    [json, setJson] = useState(() => JSON.stringify(theme.spec, null, 2)),
    [jsonDirty, setJsonDirty] = useState(false),
    [jsonPaths, setJsonPaths] = useState<string[]>([]),
    [jsonValid, setJsonValid] = useState(false);
  const [invalidFields, setInvalidFields] = useState<string[]>([]),
    [failure, setFailure] = useState<ErrorMessageCode | null>(null),
    [reason, setReason] = useState('');
  const mounted = useRef(false),
    inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const input = { id: theme.id, ...details, spec: editor.spec };
  const initial = { id: theme.id, ...adminDetailsFromTheme(theme), spec: theme.spec };
  const parsed = adminUpdateThemeSchema.safeParse(input),
    baseline = adminUpdateThemeSchema.safeParse(initial);
  const unchanged =
    parsed.success &&
    baseline.success &&
    adminEditorInputsEqual(parsed.data, baseline.data) &&
    !jsonDirty;
  const transitions = adminEditorTransitions(
    { status: theme.status, source: theme.source, ownerId: theme.owner?.id ?? null },
    actor,
  ).filter((status) => status !== 'published');
  function refresh(): void {
    startRefresh(() => router.refresh());
  }
  function applyJson(formatOnly = false): void {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      setJsonPaths(['$']);
      setJsonValid(false);
      return;
    }
    if (formatOnly) {
      setJson(JSON.stringify(value, null, 2));
      setJsonValid(false);
      return;
    }
    const result = themeSpecSchema.safeParse(value);
    if (!result.success) {
      setJsonPaths(
        result.error.issues.slice(0, 10).map((issue) => issue.path.map(String).join('.') || '$'),
      );
      setJsonValid(false);
      return;
    }
    editor.dispatch({ type: 'replaceSpec', spec: result.data });
    setJson(JSON.stringify(result.data, null, 2));
    setJsonDirty(false);
    setJsonPaths([]);
    setJsonValid(true);
  }
  async function save(): Promise<void> {
    if (inFlight.current || busy || jsonDirty) return;
    setInvalidFields(
      parsed.success
        ? []
        : [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))],
    );
    if (!parsed.success) {
      setFailure('VALIDATION');
      setTab('details');
      return;
    }
    inFlight.current = true;
    setMutating(true);
    setFailure(null);
    try {
      const result = await adminUpdateTheme(parsed.data);
      if (!mounted.current) return;
      if (!result.ok) {
        setFailure(result.error.code);
        setInvalidFields(Object.keys(result.error.fieldErrors ?? {}));
        return;
      }
      toaster.create({ type: 'success', title: t('saved') });
      refresh();
    } catch {
      if (mounted.current) setFailure('NETWORK');
    } finally {
      inFlight.current = false;
      if (mounted.current) setMutating(false);
    }
  }
  async function transition(to: ThemeStatus): Promise<void> {
    if (inFlight.current || busy || !unchanged) return;
    const parsed =
      to === 'pending_review'
        ? null
        : adminTransitionThemesSchema.safeParse({
            ids: [theme.id],
            to,
            ...(to === 'rejected' ? { reason } : {}),
          });
    if (parsed && !parsed.success) {
      setFailure('VALIDATION');
      return;
    }
    inFlight.current = true;
    setMutating(true);
    setFailure(null);
    try {
      if (to === 'pending_review') {
        const result = await submitTheme({ id: theme.id });
        if (!mounted.current) return;
        if (!result.ok) {
          setFailure(result.error.code);
          return;
        }
      } else if (parsed?.success) {
        const result = await adminTransitionThemes(parsed.data);
        if (!mounted.current) return;
        if (!result.ok) {
          setFailure(result.error.code);
          return;
        }
        const failed = result.data.results.find((item) => !item.ok);
        if (failed) {
          setFailure(failed.code ?? 'INTERNAL');
          return;
        }
      }
      refresh();
    } catch {
      if (mounted.current) setFailure('NETWORK');
    } finally {
      inFlight.current = false;
      if (mounted.current) setMutating(false);
    }
  }
  const metadata = (
    <AdminMetadataPanel
      value={details}
      onChange={setDetails}
      tags={options.tags}
      slug={theme.slug}
      invalidFields={invalidFields}
    />
  );
  return (
    <Stack gap="6" pb="16" aria-busy={busy}>
      <Button asChild minH="11" variant="ghost" alignSelf="start">
        <Link href="/admin/themes">{t('backThemes')}</Link>
      </Button>
      <Stack gap="3" p="4" rounded="card" bg="bg.panel" borderWidth="hairline" borderColor="border">
        <Flex gap="2" wrap="wrap" align="center">
          <Badge>{statusLabel(theme.status)}</Badge>
          <Button minH="11" variant="ghost" disabled={busy || !unchanged} onClick={refresh}>
            {t('refresh')}
          </Button>
          {theme.stale ? (
            <Text textStyle="body.sm" color="orange.fg">
              {t('staleHint')}
            </Text>
          ) : null}
          <Button
            minH="11"
            colorPalette="brand"
            loading={busy}
            disabled={jsonDirty}
            onClick={() => void save()}
          >
            {t('save')}
          </Button>
          {['approved', 'archived', 'published'].includes(theme.status) ? (
            <Button
              minH="11"
              variant="outline"
              disabled={busy || !unchanged}
              onClick={() => {
                queue.enqueue([{ id: theme.id, nameEn: theme.nameEn, nameAr: theme.nameAr }], {
                  force: theme.status === 'published',
                });
                toaster.create({ type: 'success', title: t('publishQueued') });
              }}
            >
              {t(theme.status === 'published' ? 'rerender' : 'publish')}
            </Button>
          ) : null}
          {transitions.map((to) => (
            <Button
              key={to}
              minH="11"
              variant="outline"
              disabled={busy || !unchanged}
              onClick={() => void transition(to)}
            >
              {to === 'pending_review'
                ? creator('submit')
                : to === 'approved'
                  ? actions('approve')
                  : to === 'rejected'
                    ? actions('reject')
                    : to === 'archived'
                      ? actions('archive')
                      : actions('toDraft')}
            </Button>
          ))}
        </Flex>
        {!unchanged ? (
          <Text textStyle="body.sm" color="fg.muted">
            {t('unsavedPublish')}
          </Text>
        ) : null}
        {transitions.includes('rejected') ? (
          <Field.Root disabled={busy}>
            <Field.Label>{t('reason')}</Field.Label>
            <Textarea
              value={reason}
              maxLength={500}
              minH="24"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field.Root>
        ) : null}
        {theme.rejectionReason ? (
          <Text textStyle="body.sm" overflowWrap="anywhere">
            {theme.rejectionReason}
          </Text>
        ) : null}
        {theme.publishError ? (
          <Text textStyle="body.sm" color="red.fg">
            {t('publishError')}:{' '}
            {theme.publishError === 'Asset rendering failed.'
              ? t('renderFailed')
              : theme.publishError === 'Asset upload failed.'
                ? t('uploadFailed')
                : errors('INTERNAL')}
          </Text>
        ) : null}
        {failure ? (
          <Text role="alert" textStyle="body.sm" color="red.fg">
            {errors(failure)}
          </Text>
        ) : null}
      </Stack>
      <Box inert={busy ? true : undefined}>
        <Tabs.Root
          value={tab}
          onValueChange={({ value }) => {
            if (!tabs.includes(value as EditorTab)) return;
            if (jsonDirty && value !== 'json') {
              setFailure('VALIDATION');
              return;
            }
            if (value === 'json' && !jsonDirty) {
              setJson(JSON.stringify(editor.spec, null, 2));
              setJsonPaths([]);
              setJsonValid(false);
            }
            setTab(value as EditorTab);
          }}
          lazyMount
          unmountOnExit
          colorPalette="brand"
        >
          <Tabs.List overflowX="auto" overflowY="hidden">
            {tabs.map((value) => (
              <Tabs.Trigger key={value} value={value} minH="11" flexShrink="0">
                {t(value)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="visual">
            <StudioWorkspace
              editor={editor}
              sourceSlug={null}
              initialSource={null}
              initialRemix={null}
              entryError={null}
              restored={false}
              creator={{
                details: metadata,
                wallpaperTools: () => null,
                onSave: () => void save(),
                busy,
                saveDisabled: jsonDirty,
                labels: { save: t('save'), details: t('details') },
                showIcons: true,
              }}
            />
          </Tabs.Content>
          <Tabs.Content value="details">{metadata}</Tabs.Content>
          <Tabs.Content value="json">
            <Stack gap="4">
              <Field.Root invalid={jsonPaths.length > 0}>
                <Field.Label>{t('json')}</Field.Label>
                <Textarea
                  dir="ltr"
                  fontFamily="mono"
                  minH="96"
                  maxLength={32768}
                  value={json}
                  onChange={(event) => {
                    setJson(event.target.value);
                    setJsonDirty(true);
                    setJsonValid(false);
                    setJsonPaths([]);
                  }}
                />
                <Field.HelperText>{t('jsonApplyFirst')}</Field.HelperText>
                {jsonPaths.map((path) => (
                  <Field.ErrorText key={path}>{t('jsonInvalid', { path })}</Field.ErrorText>
                ))}
              </Field.Root>
              <Flex gap="2" wrap="wrap">
                <Button minH="11" variant="outline" onClick={() => applyJson(true)}>
                  {t('formatJson')}
                </Button>
                <Button minH="11" colorPalette="brand" onClick={() => applyJson()}>
                  {t('validateJson')}
                </Button>
                <Button
                  minH="11"
                  variant="ghost"
                  onClick={() => {
                    setJson(JSON.stringify(editor.spec, null, 2));
                    setJsonDirty(false);
                    setJsonPaths([]);
                    setJsonValid(false);
                  }}
                >
                  {t('resetJson')}
                </Button>
              </Flex>
              {jsonValid ? (
                <Text role="status" textStyle="body.sm" color="green.fg">
                  {t('jsonValid')}
                </Text>
              ) : null}
            </Stack>
          </Tabs.Content>
          <Tabs.Content value="history">
            <AdminAuditEntries entries={theme.history} />
          </Tabs.Content>
          <Tabs.Content value="stats">
            <Stack gap="4">
              <Text as="h2" textStyle="heading.md">
                {t('statsTitle')}
              </Text>
              <DownloadsChart data={theme.stats} />
            </Stack>
          </Tabs.Content>
        </Tabs.Root>
      </Box>
    </Stack>
  );
}
