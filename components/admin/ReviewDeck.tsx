'use client';

import {
  Badge,
  Box,
  Button,
  Checkbox,
  CloseButton,
  Dialog,
  Field,
  Flex,
  Kbd,
  NativeSelect,
  Portal,
  Skeleton,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Link, useRouter } from '@/i18n/navigation';
import type { AdminReviewItem, AdminReviewPage, AdminThemeOptions } from '@/lib/admin';
import { reviewDecisionKey, reviewItemBlocked, undoableDecision } from '@/lib/admin-workflow';
import type { ReviewDecisionTarget } from '@/lib/admin-workflow';
import type { ErrorMessageCode } from '@/lib/result';
import { rejectionReasonSchema } from '@/lib/theme-status';
import { adminReviewQuerySchema } from '@/lib/validation/admin-queries';
import type { AdminReviewQuery } from '@/lib/validation/admin-queries';
import { formatNumber } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import { refreshAdminReview, refreshAdminReviewItem } from '@/server/actions/admin/queries';
import { adminSetFeatured } from '@/server/actions/admin/themes';
import { usePublishQueue } from './PublishQueueProvider';

const ReviewPreviews = dynamic(
  () => import('./ReviewPreviews').then((module) => module.ReviewPreviews),
  {
    loading: (): ReactElement => <Skeleton h="96" rounded="card" />,
  },
);
const reasons = [
  'lowQuality',
  'duplicate',
  'offAesthetic',
  'lowContrast',
  'inappropriate',
  'other',
] as const;

function ignoresShortcut(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.isComposing ||
    event.repeat ||
    (target instanceof HTMLElement &&
      Boolean(target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')))
  );
}

export function ReviewDeck({
  initialPage,
  query,
  options,
}: {
  initialPage: AdminReviewPage;
  query: AdminReviewQuery;
  options: AdminThemeOptions;
}): ReactElement {
  const t = useTranslations('admin.review'),
    common = useTranslations('common'),
    errors = useTranslations('errors');
  const shared = useTranslations('admin.common'),
    themes = useTranslations('admin.themes'),
    locale = useLocale(),
    router = useRouter(),
    id = useId();
  const { review: decisions, stageReview, undoReview, retryReview } = usePublishQueue();
  const [items, setItems] = useState(initialPage.items);
  const [page, setPage] = useState(initialPage);
  const [index, setIndex] = useState(0),
    [publish, setPublish] = useState(false);
  const [rejecting, setRejecting] = useState<AdminReviewItem | null>(null),
    [reason, setReason] = useState('');
  const [invalidReason, setInvalidReason] = useState(false),
    [featureBusy, setFeatureBusy] = useState(false);
  const [failure, setFailure] = useState<ErrorMessageCode | null>(null),
    [fetchFailure, setFetchFailure] = useState<ErrorMessageCode | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const featureRequest = useRef(false);
  const cache = useRef(new Map<string, ReturnType<typeof refreshAdminReview>>());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const available = items.filter((item) => !reviewItemBlocked(decisions, item));
  const position = Math.min(index, Math.max(0, available.length - 1));
  const item = available[position];
  const pending = decisions.decisions.filter((value) => value.status === 'pending');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A stable keyset cursor keeps decisions from shifting later pages underneath us.
  useEffect(() => {
    const cursor = page.nextCursor;
    if (!cursor || available.length > 40) return;
    let active = true;
    let request = cache.current.get(cursor);
    if (!request) {
      request = refreshAdminReview({ ...query, page: page.page + 1, cursor });
      cache.current.set(cursor, request);
    }
    void request
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setFetchFailure(result.error.code);
          return;
        }
        setFetchFailure(null);
        setItems((previous) => {
          const ids = new Set(previous.map((value) => value.id));
          return [...previous, ...result.data.items.filter((value) => !ids.has(value.id))];
        });
        setPage(result.data);
      })
      .catch(() => {
        if (active) setFetchFailure('NETWORK');
      });
    return () => {
      active = false;
    };
  }, [page.nextCursor, page.page, available.length, query, attempt]);
  function stage(to: ReviewDecisionTarget, value = item, reasonValue?: string): void {
    if (!value || featureRequest.current) return;
    stageReview({ theme: value, to, publish, reason: reasonValue });
    setFailure(null);
  }
  function undo(): void {
    const now = Date.now(),
      decision = undoableDecision(decisions, now);
    if (!decision) return;
    const remaining = {
      decisions: decisions.decisions.filter((value) => value.key !== decision.key),
    };
    const restored = items.filter((value) => !reviewItemBlocked(remaining, value));
    setIndex(
      Math.max(
        0,
        restored.findIndex((value) => reviewDecisionKey(value) === decision.key),
      ),
    );
    undoReview();
  }
  function reject(): void {
    if (item && !featureRequest.current) {
      setReason('');
      setInvalidReason(false);
      setRejecting(item);
    }
  }
  async function feature(): Promise<void> {
    if (!item || featureRequest.current) return;
    featureRequest.current = true;
    setFeatureBusy(true);
    setFailure(null);
    try {
      const result = await adminSetFeatured({ ids: [item.id], featured: !item.isFeatured });
      if (!mounted.current) return;
      const row = result.ok ? result.data.results.find((value) => value.id === item.id) : undefined;
      if (!result.ok || !row?.ok) {
        setFailure(result.ok ? (row?.code ?? 'INTERNAL') : result.error.code);
        return;
      }
      // Refresh the full preview and token together; F changes generated draft updated_at.
      const refreshed = await refreshAdminReviewItem({ id: item.id });
      if (!mounted.current) return;
      if (!refreshed.ok) {
        setFailure(refreshed.error.code);
        return;
      }
      const current = refreshed.data;
      setItems((previous) =>
        current
          ? previous.map((value) => (value.id === current.id ? current : value))
          : previous.filter((value) => value.id !== item.id),
      );
    } catch {
      if (mounted.current) setFailure('NETWORK');
    } finally {
      featureRequest.current = false;
      if (mounted.current) setFeatureBusy(false);
    }
  }
  function navigate(delta: number): void {
    setIndex(Math.max(0, Math.min(available.length - 1, position + delta)));
  }
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (ignoresShortcut(event) || rejecting) return;
      const value = event.key.toLowerCase();
      if (!['a', 'r', 's', 'f', 'z', 'arrowleft', 'arrowright'].includes(value)) return;
      event.preventDefault();
      if (value === 'a') stage('approved');
      else if (value === 'r') reject();
      else if (value === 's' || value === 'arrowright') navigate(1);
      else if (value === 'arrowleft') navigate(-1);
      else if (value === 'z') undo();
      else void feature();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  function filter(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = adminReviewQuerySchema.safeParse({
      aesthetic: data.get('aesthetic'),
      run: data.get('run'),
    });
    if (!parsed.success) {
      setFailure('VALIDATION');
      return;
    }
    const values = new URLSearchParams();
    if (parsed.data.aesthetic) values.set('aesthetic', parsed.data.aesthetic);
    if (parsed.data.run) values.set('run', parsed.data.run);
    router.push(`/admin/review${values.size ? `?${values}` : ''}`);
  }
  return (
    <Stack gap="6">
      <form onSubmit={filter} aria-label={t('filters')}>
        <Flex gap="3" flexWrap="wrap" align="end">
          <Field.Root flex="1" minW="40">
            <Field.Label htmlFor={`${id}-aesthetic`}>{t('aesthetic')}</Field.Label>
            <NativeSelect.Root size="lg">
              <NativeSelect.Field
                id={`${id}-aesthetic`}
                name="aesthetic"
                defaultValue={query.aesthetic ?? ''}
              >
                <option value="">{shared('none')}</option>
                {options.tags
                  .filter((tag) => tag.kind === 'aesthetic')
                  .map((tag) => (
                    <option key={tag.id} value={tag.slug}>
                      {localized(tag, locale)}
                    </option>
                  ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Field.Root flex="1" minW="40">
            <Field.Label htmlFor={`${id}-run`}>{themes('run')}</Field.Label>
            <NativeSelect.Root size="lg">
              <NativeSelect.Field id={`${id}-run`} name="run" defaultValue={query.run ?? ''}>
                <option value="">{shared('none')}</option>
                {options.runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.aesthetic} · {run.id.slice(0, 8)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Button type="submit" minH="11" variant="outline">
            {themes('applyFilters')}
          </Button>
        </Flex>
      </form>
      <Flex gap="3" flexWrap="wrap" align="center">
        <Checkbox.Root
          checked={publish}
          onCheckedChange={({ checked }) => setPublish(checked === true)}
          minH="11"
          colorPalette="brand"
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Label>{t('approveAndPublish')}</Checkbox.Label>
        </Checkbox.Root>
        <Button
          minH="11"
          variant="outline"
          aria-keyshortcuts="Z"
          disabled={!pending.length}
          onClick={undo}
        >
          {t('undo')} <Kbd>Z</Kbd>
        </Button>
      </Flex>
      {pending.length ? (
        <Text textStyle="body.sm" color="fg.muted" role="status">
          {t('pending', { count: pending.length })} · {t('undoHint')}
        </Text>
      ) : decisions.decisions.some((value) => value.status === 'sending') ? (
        <Text textStyle="body.sm" color="fg.muted" role="status">
          {t('sending')}
        </Text>
      ) : decisions.decisions.some((value) => value.status === 'done') ? (
        <Text textStyle="body.sm" color="fg.muted" role="status">
          {t('saved')}
        </Text>
      ) : null}
      {failure ? (
        <Text textStyle="body.sm" color="red.fg" role="alert">
          {errors(failure)}
        </Text>
      ) : null}
      {item ? (
        <Stack
          gap="5"
          p={{ base: '3', md: '6' }}
          bg="bg.panel"
          borderWidth="hairline"
          borderColor="border"
          rounded="card"
        >
          <Flex gap="3" align="start" justify="space-between">
            <Stack gap="2" minW="0">
              <Text as="h2" textStyle="display.lg" overflowWrap="anywhere">
                {localized(item, locale)}
              </Text>
              <Text textStyle="caption" color="fg.muted" overflowWrap="anywhere">
                {shared(`sources.${item.source}`)} · {t('creator')}:{' '}
                {item.owner?.handle ?? item.owner?.name ?? t('noCreator')}
              </Text>
              <Text textStyle="caption" color="fg.muted">
                {t('aesthetic')}:{' '}
                {localized(item.tags.find((tag) => tag.kind === 'aesthetic') ?? {}, locale)}
              </Text>
            </Stack>
            <Button asChild variant="outline" minH="11">
              <Link href={`/admin/themes/${item.id}`}>{t('edit')}</Link>
            </Button>
          </Flex>
          <Flex gap="2" flexWrap="wrap">
            <Badge colorPalette={item.qa.ok ? 'green' : 'orange'}>
              {t(item.qa.ok ? 'qaPassed' : 'qaFailed')}
            </Badge>
            <Badge>
              {t('contrast', {
                value: formatNumber(item.qa.minIconContrast, locale, { maximumFractionDigits: 2 }),
              })}
            </Badge>
            {item.isFeatured ? <Badge colorPalette="brand">{shared('featured')}</Badge> : null}
            {item.nearestDuplicate ? (
              <Badge colorPalette="orange" maxW="full" whiteSpace="normal" overflowWrap="anywhere">
                {t('duplicate', {
                  name: localized(item.nearestDuplicate, locale),
                  distance: item.nearestDuplicate.distance,
                })}
              </Badge>
            ) : (
              <Badge>{t('noDuplicate')}</Badge>
            )}
          </Flex>
          <Box
            onPointerDown={(event) => {
              if (event.pointerType === 'touch')
                pointer.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerUp={(event) => {
              const start = pointer.current;
              pointer.current = null;
              if (!start || event.pointerType !== 'touch') return;
              const dx = event.clientX - start.x,
                dy = event.clientY - start.y;
              if (Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (dx > 0) stage('approved');
                else reject();
              }
            }}
            onPointerCancel={() => {
              pointer.current = null;
            }}
            touchAction="pan-y"
          >
            <ReviewPreviews key={item.id} spec={item.spec} />
          </Box>
          <Text textStyle="caption" color="fg.muted">
            {t('swipeHint')}
          </Text>
          <Flex gap="2" flexWrap="wrap">
            <Button
              colorPalette="brand"
              minH="11"
              flex="1"
              aria-keyshortcuts="A"
              disabled={featureBusy}
              onClick={() => stage('approved')}
            >
              {t('approve')} <Kbd>A</Kbd>
            </Button>
            <Button
              colorPalette="red"
              variant="outline"
              minH="11"
              flex="1"
              aria-keyshortcuts="R"
              disabled={featureBusy}
              onClick={reject}
            >
              {t('reject')} <Kbd>R</Kbd>
            </Button>
            <Button variant="outline" minH="11" aria-keyshortcuts="S" onClick={() => navigate(1)}>
              {t('skip')} <Kbd>S</Kbd>
            </Button>
            <Button
              variant="outline"
              minH="11"
              aria-keyshortcuts="F"
              loading={featureBusy}
              onClick={() => void feature()}
            >
              {t(item.isFeatured ? 'unfeature' : 'feature')} <Kbd>F</Kbd>
            </Button>
          </Flex>
          <Flex gap="3" align="center" justify="space-between" flexWrap="wrap">
            <Button
              minH="11"
              variant="ghost"
              aria-keyshortcuts="ArrowLeft"
              disabled={position === 0}
              onClick={() => navigate(-1)}
            >
              {t('previous')} <Kbd>←</Kbd>
            </Button>
            <Text textStyle="caption" color="fg.muted">
              {t('position', { index: position + 1, total: available.length })}
            </Text>
            <Button
              minH="11"
              variant="ghost"
              aria-keyshortcuts="ArrowRight"
              disabled={position >= available.length - 1}
              onClick={() => navigate(1)}
            >
              {t('next')} <Kbd>→</Kbd>
            </Button>
          </Flex>
        </Stack>
      ) : (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <Button minH="11" variant="outline" onClick={() => router.refresh()}>
              {t('reload')}
            </Button>
          }
        />
      )}
      {fetchFailure ? (
        <Stack role="alert" gap="2">
          <Text textStyle="body.sm" color="red.fg">
            {errors(fetchFailure)}
          </Text>
          <Button
            minH="11"
            variant="outline"
            onClick={() => {
              if (page.nextCursor) cache.current.delete(page.nextCursor);
              setFetchFailure(null);
              setAttempt((value) => value + 1);
            }}
          >
            {common('retry')}
          </Button>
        </Stack>
      ) : page.nextCursor && available.length <= 40 ? (
        <Text role="status" textStyle="body.sm" color="fg.muted">
          {t('loadingMore')}
        </Text>
      ) : null}
      {decisions.decisions
        .filter((value) => value.status === 'failed')
        .map((value) => (
          <Flex key={value.key} gap="3" align="center" role="alert">
            <Text textStyle="body.sm" color="red.fg">
              {localized(value, locale)}: {errors(value.error ?? 'INTERNAL')}
            </Text>
            <Button
              minH="11"
              variant="outline"
              onClick={() =>
                value.error === 'CONFLICT' ? router.refresh() : retryReview(value.key)
              }
            >
              {value.error === 'CONFLICT' ? t('reload') : common('retry')}
            </Button>
          </Flex>
        ))}
      <Dialog.Root
        open={Boolean(rejecting)}
        onOpenChange={({ open }) => {
          if (!open) setRejecting(null);
        }}
        lazyMount
        unmountOnExit
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner px="4">
            <Dialog.Content rounded="card" bg="bg.panel">
              <Dialog.Header pe="14">
                <Dialog.Title>{t('reasonTitle')}</Dialog.Title>
                <Dialog.Description>{t('reasonDescription')}</Dialog.Description>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap="4">
                  <Flex gap="2" flexWrap="wrap">
                    {reasons.map((key) => (
                      <Button
                        key={key}
                        minH="11"
                        variant="outline"
                        onClick={() => setReason(key === 'other' ? '' : t(`reasons.${key}`))}
                      >
                        {t(`reasons.${key}`)}
                      </Button>
                    ))}
                  </Flex>
                  <Field.Root invalid={invalidReason}>
                    <Field.Label htmlFor={`${id}-reason`}>{t('reason')}</Field.Label>
                    <Textarea
                      id={`${id}-reason`}
                      value={reason}
                      maxLength={500}
                      minH="24"
                      onChange={(event) => {
                        setReason(event.target.value);
                        setInvalidReason(false);
                      }}
                    />
                    <Field.ErrorText>{t('reasonRequired')}</Field.ErrorText>
                  </Field.Root>
                </Stack>
              </Dialog.Body>
              <Dialog.Footer flexWrap="wrap">
                <Button minH="11" variant="outline" onClick={() => setRejecting(null)}>
                  {common('cancel')}
                </Button>
                <Button
                  minH="11"
                  colorPalette="red"
                  onClick={() => {
                    const parsed = rejectionReasonSchema.safeParse(reason);
                    if (!parsed.success) {
                      setInvalidReason(true);
                      return;
                    }
                    if (rejecting) stage('rejected', rejecting, parsed.data);
                    setRejecting(null);
                  }}
                >
                  {t('submitRejection')}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="lg" aria-label={common('close')} />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Stack>
  );
}
