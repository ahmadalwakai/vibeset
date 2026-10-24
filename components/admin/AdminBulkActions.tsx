'use client';

import {
  ActionBar,
  Button,
  Field,
  Flex,
  Input,
  NativeSelect,
  Portal,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { toaster } from '@/components/ui/toaster';
import { useRouter } from '@/i18n/navigation';
import type { AdminThemeOptions } from '@/lib/admin';
import type { AdminThemeBulkData } from '@/lib/admin-themes';
import type { ActionResult, ErrorMessageCode } from '@/lib/result';
import { localized } from '@/lib/utils/localized';
import {
  adminAddToCollectionSchema,
  adminDeleteThemesSchema,
  adminSetFeaturedSchema,
  adminTagThemesSchema,
  adminTransitionThemesSchema,
} from '@/lib/validation/admin-themes';
import {
  adminAddToCollection,
  adminDeleteThemes,
  adminSetFeatured,
  adminTagThemes,
  adminTransitionThemes,
} from '@/server/actions/admin/themes';

type BulkOperation =
  | 'approve'
  | 'reject'
  | 'archive'
  | 'toDraft'
  | 'feature'
  | 'unfeature'
  | 'addTags'
  | 'removeTags'
  | 'addCollection'
  | 'delete';
const operations: readonly BulkOperation[] = [
  'approve',
  'reject',
  'archive',
  'toDraft',
  'feature',
  'unfeature',
  'addTags',
  'removeTags',
  'addCollection',
  'delete',
];
export function AdminBulkActions({
  ids,
  options,
  onBusyChange,
  onCompleted,
}: {
  ids: readonly string[];
  options: AdminThemeOptions;
  onBusyChange: (busy: boolean) => void;
  onCompleted: (data: AdminThemeBulkData) => void;
}): ReactElement {
  const t = useTranslations('admin.themes'),
    reasons = useTranslations('admin.review.reasons'),
    errors = useTranslations('errors'),
    common = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();
  const [operation, setOperation] = useState<BulkOperation | null>(null),
    [reason, setReason] = useState(''),
    [tags, setTags] = useState(''),
    [collectionId, setCollectionId] = useState(options.collections[0]?.id ?? '');
  const [mutating, setMutating] = useState(false),
    [refreshing, startRefresh] = useTransition(),
    [error, setError] = useState<ErrorMessageCode | null>(null),
    [invalid, setInvalid] = useState(false);
  const [results, setResults] = useState<AdminThemeBulkData | null>(null);
  const mounted = useRef(false),
    inFlight = useRef(false);
  const busy = mutating || refreshing;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onBusyChange(false);
    };
  }, [onBusyChange]);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  async function apply(kind: BulkOperation): Promise<boolean> {
    if (inFlight.current || refreshing || !ids.length) return false;
    const parsedTags = tags.split(/[,،\s]+/u).filter(Boolean);
    let action: (input: unknown) => Promise<ActionResult<AdminThemeBulkData>>;
    let value: unknown;
    if (kind === 'feature' || kind === 'unfeature') {
      action = adminSetFeatured;
      const parsed = adminSetFeaturedSchema.safeParse({ ids, featured: kind === 'feature' });
      value = parsed.success ? parsed.data : null;
    } else if (kind === 'addTags' || kind === 'removeTags') {
      action = adminTagThemes;
      const parsed = adminTagThemesSchema.safeParse({
        ids,
        add: kind === 'addTags' ? parsedTags : [],
        remove: kind === 'removeTags' ? parsedTags : [],
      });
      value = parsed.success && parsedTags.length ? parsed.data : null;
    } else if (kind === 'addCollection') {
      action = adminAddToCollection;
      const parsed = adminAddToCollectionSchema.safeParse({ ids, collectionId });
      value = parsed.success ? parsed.data : null;
    } else if (kind === 'delete') {
      action = adminDeleteThemes;
      const parsed = adminDeleteThemesSchema.safeParse({ ids });
      value = parsed.success ? parsed.data : null;
    } else {
      action = adminTransitionThemes;
      const parsed = adminTransitionThemesSchema.safeParse({
        ids,
        to:
          kind === 'approve'
            ? 'approved'
            : kind === 'reject'
              ? 'rejected'
              : kind === 'archive'
                ? 'archived'
                : 'draft',
        ...(kind === 'reject' ? { reason } : {}),
      });
      value = parsed.success ? parsed.data : null;
    }
    setInvalid(value === null);
    setError(value === null ? 'VALIDATION' : null);
    if (value === null) return false;
    inFlight.current = true;
    setMutating(true);
    try {
      const result = await action(value);
      if (!mounted.current) return false;
      if (!result.ok) {
        setError(result.error.code);
        return false;
      }
      setResults(result.data);
      setOperation(null);
      onCompleted(result.data);
      toaster.create({
        type: result.data.results.some((item) => !item.ok) ? 'warning' : 'success',
        title: t('results', {
          success: result.data.count,
          failed: result.data.results.filter((item) => !item.ok).length,
        }),
      });
      startRefresh(() => router.refresh());
      return true;
    } catch {
      if (mounted.current) setError('NETWORK');
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setMutating(false);
    }
  }
  function choose(kind: BulkOperation): void {
    setError(null);
    setInvalid(false);
    if (['reject', 'addTags', 'removeTags', 'addCollection', 'delete'].includes(kind))
      setOperation(kind);
    else void apply(kind);
  }
  return (
    <>
      <ActionBar.Root open={ids.length > 0}>
        <Portal>
          <ActionBar.Positioner>
            <ActionBar.Content maxW="calc(100vw - 2rem)" flexWrap="wrap" gap="2" aria-busy={busy}>
              <Text textStyle="body.sm">{t('selected', { count: ids.length })}</Text>
              {operations.map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  minH="11"
                  variant="outline"
                  colorPalette={kind === 'delete' ? 'red' : 'brand'}
                  disabled={busy}
                  onClick={() => choose(kind)}
                >
                  {t(kind)}
                </Button>
              ))}
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>
      {results ? (
        <Stack gap="2" p="4" bg="bg.subtle" rounded="card" role="status">
          <Text fontWeight="medium">
            {t('results', {
              success: results.count,
              failed: results.results.filter((item) => !item.ok).length,
            })}
          </Text>
          {results.results
            .filter((item) => !item.ok)
            .map((item) => (
              <Text key={item.id} textStyle="body.sm" color="red.fg" overflowWrap="anywhere">
                {item.id}: {errors(item.code ?? 'INTERNAL')}
              </Text>
            ))}
        </Stack>
      ) : null}
      {error && !operation ? (
        <Text role="alert" textStyle="body.sm" color="red.fg">
          {errors(error)}
        </Text>
      ) : null}
      <ResponsiveSheet
        open={operation !== null && operation !== 'delete'}
        onOpenChange={(open) => {
          if (!open && !busy) setOperation(null);
        }}
        title={operation ? t(operation) : t('apply')}
      >
        <Stack gap="4">
          {operation === 'reject' ? (
            <>
              <Field.Root disabled={busy} invalid={invalid}>
                <Field.Label>{t('quickReason')}</Field.Label>
                <NativeSelect.Root size="lg">
                  <NativeSelect.Field value="" onChange={(event) => setReason(event.target.value)}>
                    <option value="">{t('quickReason')}</option>
                    {(
                      [
                        'lowQuality',
                        'duplicate',
                        'offAesthetic',
                        'lowContrast',
                        'inappropriate',
                        'other',
                      ] as const
                    ).map((key) => (
                      <option key={key} value={reasons(key)}>
                        {reasons(key)}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
              <Field.Root disabled={busy} invalid={invalid} required>
                <Field.Label>{t('reason')}</Field.Label>
                <Textarea
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
              </Field.Root>
            </>
          ) : null}
          {operation === 'addTags' || operation === 'removeTags' ? (
            <Field.Root disabled={busy} invalid={invalid} required>
              <Field.Label>{t('tagSlugs')}</Field.Label>
              <Input value={tags} minH="11" onChange={(event) => setTags(event.target.value)} />
              <Field.HelperText>{t('tagHint')}</Field.HelperText>
              <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
            </Field.Root>
          ) : null}
          {operation === 'addCollection' ? (
            <Field.Root disabled={busy} invalid={invalid} required>
              <Field.Label>{t('collection')}</Field.Label>
              <NativeSelect.Root size="lg">
                <NativeSelect.Field
                  value={collectionId}
                  onChange={(event) => setCollectionId(event.target.value)}
                >
                  {options.collections.map((item) => (
                    <option key={item.id} value={item.id}>
                      {localized(item, locale, 'title')}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
            </Field.Root>
          ) : null}
          {error ? (
            <Text role="alert" textStyle="body.sm" color="red.fg">
              {errors(error)}
            </Text>
          ) : null}
          <Flex gap="2">
            <Button minH="11" variant="outline" disabled={busy} onClick={() => setOperation(null)}>
              {common('cancel')}
            </Button>
            <Button
              minH="11"
              colorPalette="brand"
              loading={busy}
              onClick={() => {
                if (operation) void apply(operation);
              }}
            >
              {t('apply')}
            </Button>
          </Flex>
        </Stack>
      </ResponsiveSheet>
      <ConfirmDialog
        open={operation === 'delete'}
        onOpenChange={(open) => {
          if (!open && !busy) setOperation(null);
        }}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmationText={t('confirmDeleteWord')}
        confirmLabel={t('delete')}
        pending={busy}
        errorCode={error}
        onConfirm={() => apply('delete')}
      />
    </>
  );
}
