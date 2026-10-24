'use client';

import {
  Badge,
  Button,
  Checkbox,
  Field,
  Flex,
  NativeSelect,
  Progress,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Link } from '@/i18n/navigation';
import type { AdminPage, AdminThemeRow } from '@/lib/admin';
import { publishQueueBusy } from '@/lib/admin-workflow';
import type { ErrorMessageCode } from '@/lib/result';
import { adminPublishQuerySchema } from '@/lib/validation/admin-queries';
import type { AdminPublishQuery } from '@/lib/validation/admin-queries';
import { localized } from '@/lib/utils/localized';
import { refreshAdminPublish } from '@/server/actions/admin/queries';
import { usePublishQueue } from './PublishQueueProvider';

export function PublishQueueIndicator(): ReactElement | null {
  const queue = usePublishQueue(),
    t = useTranslations('admin.publish'),
    review = useTranslations('admin.review');
  const queued = queue.items.filter((item) => item.status === 'queued').length;
  const running = queue.items.filter((item) => item.status === 'rendering').length;
  const pending = queue.review.decisions.filter((item) => item.status === 'pending').length;
  const sending = queue.review.decisions.some((item) => item.status === 'sending');
  const hasPublish = queued || running || queue.items.some((item) => item.status === 'failed');
  if (!hasPublish && !pending && !sending) return null;
  return (
    <Flex gap="2" flexWrap="wrap" aria-live="polite">
      {hasPublish ? (
        <Button asChild minH="11" variant="subtle" colorPalette="brand">
          <Link href="/admin/publish">{t('indicator', { queued, running })}</Link>
        </Button>
      ) : null}
      {pending || sending ? (
        <Button asChild minH="11" variant="subtle">
          <Link href="/admin/review">
            {pending ? review('pending', { count: pending }) : review('sending')}
          </Link>
        </Button>
      ) : null}
      {pending ? (
        <Button minH="11" variant="outline" onClick={queue.undoReview}>
          {review('undo')}
        </Button>
      ) : null}
    </Flex>
  );
}

export function PublishQueue({
  initialPage,
  query,
}: {
  initialPage: AdminPage<AdminThemeRow>;
  query: AdminPublishQuery;
}): ReactElement {
  const t = useTranslations('admin.publish'),
    common = useTranslations('common'),
    shared = useTranslations('admin.common'),
    errors = useTranslations('errors');
  const editor = useTranslations('admin.editor');
  const statuses = useTranslations('creator.status'),
    themes = useTranslations('admin.themes');
  const locale = useLocale(),
    id = useId(),
    queue = usePublishQueue();
  const [page, setPage] = useState(initialPage),
    [selected, setSelected] = useState(new Set<string>());
  const [kind, setKind] = useState(query.kind),
    [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<ErrorMessageCode | null>(null);
  const mounted = useRef(false),
    epoch = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
    };
  }, []);
  const done = queue.items.filter((item) =>
    ['done', 'skipped', 'failed', 'cancelled'].includes(item.status),
  ).length;
  const busy = publishQueueBusy({ items: queue.items, paused: queue.paused });
  async function load(number: number, value = kind): Promise<void> {
    const parsed = adminPublishQuerySchema.safeParse({ page: number, kind: value });
    if (!parsed.success) {
      setFailure('VALIDATION');
      return;
    }
    const request = ++epoch.current;
    setLoading(true);
    setFailure(null);
    try {
      const result = await refreshAdminPublish(parsed.data);
      if (!mounted.current || request !== epoch.current) return;
      if (!result.ok) {
        setFailure(result.error.code);
        return;
      }
      setPage(result.data);
      setSelected(new Set());
      setKind(value);
    } catch {
      if (mounted.current && request === epoch.current) setFailure('NETWORK');
    } finally {
      if (mounted.current && request === epoch.current) setLoading(false);
    }
  }
  return (
    <Stack gap="8">
      <Stack
        as="section"
        gap="4"
        p={{ base: '4', md: '6' }}
        rounded="card"
        bg="bg.panel"
        borderWidth="hairline"
        borderColor="border"
      >
        <Text as="h2" textStyle="heading.md">
          {t('queueTitle')}
        </Text>
        <Text textStyle="body.sm" color="fg.muted">
          {t('queueDescription')}
        </Text>
        {queue.items.length ? (
          <>
            <Progress.Root value={done} max={queue.items.length} colorPalette="brand">
              <Progress.Label>{t('progress', { done, total: queue.items.length })}</Progress.Label>
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
            <Flex gap="2" flexWrap="wrap">
              <Button
                minH="11"
                variant="outline"
                disabled={!busy}
                onClick={queue.paused ? queue.resume : queue.pause}
              >
                {t(queue.paused ? 'resume' : 'pause')}
              </Button>
              <Button minH="11" variant="outline" disabled={!busy} onClick={queue.cancel}>
                {t('cancel')}
              </Button>
              <Button
                minH="11"
                variant="outline"
                disabled={!queue.items.some((item) => item.status === 'failed')}
                onClick={() => queue.retry()}
              >
                {t('retryFailed')}
              </Button>
              <Button
                minH="11"
                variant="ghost"
                disabled={
                  !queue.items.some((item) =>
                    ['done', 'skipped', 'cancelled'].includes(item.status),
                  )
                }
                onClick={queue.clearFinished}
              >
                {t('clearFinished')}
              </Button>
            </Flex>
            {busy ? (
              <Text textStyle="caption" color="fg.muted" role="status">
                {t('leaveHint')}
              </Text>
            ) : null}
            <Text textStyle="caption" color="fg.muted">
              {t('cancelHint')}
            </Text>
            <Stack as="ul" gap="3" listStyleType="none" p="0" aria-live="polite">
              {queue.items.map((item) => (
                <Flex
                  as="li"
                  key={item.id}
                  gap="3"
                  align="center"
                  flexWrap="wrap"
                  p="3"
                  bg="bg.subtle"
                  rounded="input"
                >
                  <Text flex="1" minW="0" overflowWrap="anywhere">
                    {localized(item, locale)}
                  </Text>
                  <Badge
                    colorPalette={
                      item.status === 'failed' ? 'red' : item.status === 'done' ? 'green' : 'gray'
                    }
                  >
                    {t(`statuses.${item.status}`)}
                  </Badge>
                  {item.error ? (
                    <Text textStyle="body.sm" color="red.fg">
                      {errors(item.error)}
                    </Text>
                  ) : null}
                  {item.status === 'failed' ? (
                    <Button minH="11" variant="outline" onClick={() => queue.retry(item.id)}>
                      {t('retry')}
                    </Button>
                  ) : null}
                </Flex>
              ))}
            </Stack>
          </>
        ) : (
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        )}
      </Stack>
      <Stack as="section" gap="4" aria-busy={loading}>
        <Text as="h2" textStyle="heading.md">
          {t('candidatesTitle')}
        </Text>
        <Flex gap="3" flexWrap="wrap" align="end">
          <Field.Root maxW="xs">
            <Field.Label htmlFor={`${id}-filter`}>{t('filter')}</Field.Label>
            <NativeSelect.Root size="lg" disabled={loading}>
              <NativeSelect.Field
                id={`${id}-filter`}
                value={kind}
                onChange={(event) => {
                  const parsed = adminPublishQuerySchema.safeParse({ kind: event.target.value });
                  if (parsed.success) void load(1, parsed.data.kind);
                }}
              >
                {(['all', 'approved', 'stale', 'archived', 'failed'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`kinds.${value}`)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Button
            minH="11"
            variant="outline"
            loading={loading}
            onClick={() => void load(page.page)}
          >
            {t('refresh')}
          </Button>
          <Button
            minH="11"
            colorPalette="brand"
            disabled={!selected.size || loading}
            onClick={() => {
              queue.enqueue(page.items.filter((item) => selected.has(item.id)));
              setSelected(new Set());
            }}
          >
            {t('publishSelected', { count: selected.size })}
          </Button>
        </Flex>
        {failure ? (
          <Text textStyle="body.sm" color="red.fg" role="alert">
            {errors(failure)}
          </Text>
        ) : null}
        {page.items.length ? (
          <>
            <Checkbox.Root
              minH="11"
              colorPalette="brand"
              checked={
                selected.size === page.items.length ? true : selected.size ? 'indeterminate' : false
              }
              disabled={loading}
              onCheckedChange={({ checked }) =>
                setSelected(
                  checked === true ? new Set(page.items.map((item) => item.id)) : new Set(),
                )
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>{t('selectAll')}</Checkbox.Label>
            </Checkbox.Root>
            <Stack as="ul" p="0" listStyleType="none" gap="3">
              {page.items.map((item) => (
                <Flex
                  as="li"
                  key={item.id}
                  p="4"
                  gap="3"
                  align="center"
                  flexWrap="wrap"
                  bg="bg.panel"
                  rounded="card"
                  borderWidth="hairline"
                  borderColor="border"
                >
                  <Checkbox.Root
                    minH="11"
                    colorPalette="brand"
                    checked={selected.has(item.id)}
                    disabled={loading}
                    onCheckedChange={({ checked }) =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (checked === true) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      })
                    }
                  >
                    <Checkbox.HiddenInput
                      aria-label={shared('selectRow', { name: localized(item, locale) })}
                    />
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Root>
                  <Stack gap="2" flex="1" minW="0">
                    <Button
                      asChild
                      variant="plain"
                      minH="11"
                      justifyContent="start"
                      whiteSpace="normal"
                      overflowWrap="anywhere"
                    >
                      <Link href={`/admin/themes/${item.id}`}>{localized(item, locale)}</Link>
                    </Button>
                    <Flex gap="2" flexWrap="wrap">
                      <Badge>{statuses(item.status)}</Badge>
                      {item.stale ? <Badge colorPalette="orange">{shared('stale')}</Badge> : null}
                    </Flex>
                    {item.publishError ? (
                      <Text textStyle="caption" color="red.fg" overflowWrap="anywhere">
                        {t('lastError')}:{' '}
                        {item.publishError === 'Asset rendering failed.'
                          ? editor('renderFailed')
                          : item.publishError === 'Asset upload failed.'
                            ? editor('uploadFailed')
                            : errors('INTERNAL')}
                      </Text>
                    ) : null}
                  </Stack>
                </Flex>
              ))}
            </Stack>
          </>
        ) : (
          <EmptyState title={t('noCandidates')} />
        )}
        <Flex justify="space-between" gap="3">
          <Button
            minH="11"
            variant="outline"
            disabled={loading || page.page <= 1}
            onClick={() => void load(page.page - 1)}
          >
            {t('previous')}
          </Button>
          <Text alignSelf="center" textStyle="caption" color="fg.muted">
            {themes('pagination', { page: page.page, total: page.total })}
          </Text>
          <Button
            minH="11"
            variant="outline"
            disabled={loading || !page.nextPage}
            onClick={() => {
              if (page.nextPage) void load(page.nextPage);
            }}
          >
            {t('loadMore')}
          </Button>
        </Flex>
        <Button asChild minH="11" alignSelf="start" variant="ghost">
          <Link href="/admin/themes">{common('back')}</Link>
        </Button>
      </Stack>
    </Stack>
  );
}
