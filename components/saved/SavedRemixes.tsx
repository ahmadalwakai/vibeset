'use client';

import { Button, HStack, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { toaster } from '@/components/ui/toaster';
import { Link } from '@/i18n/navigation';
import type { SavedRemix } from '@/lib/account';
import type { ErrorMessageCode } from '@/lib/result';
import { apiErrorSchema } from '@/lib/validation/themes';
import { savedRemixesPageSchema } from '@/lib/validation/saved-remixes';
import { deleteRemix } from '@/server/actions/studio';
import { SavedLoading } from './SavedTabs';

export function SavedRemixes(): ReactElement {
  const t = useTranslations('saved');
  const locale = useLocale();
  const [rows, setRows] = useState<SavedRemix[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [failure, setFailure] = useState<ErrorMessageCode | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<SavedRemix | null>(null);
  const [deleteError, setDeleteError] = useState<ErrorMessageCode | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const alive = useRef(false);
  async function load(after: string | null): Promise<void> {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setFailure(null);
    try {
      const query = after ? `?${new URLSearchParams({ cursor: after })}` : '';
      const response = await fetch(`/api/me/remixes${query}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error = apiErrorSchema.safeParse(body);
        if (alive.current && !controller.signal.aborted)
          setFailure(error.success ? error.data.error.code : 'INTERNAL');
        return;
      }
      const parsed = savedRemixesPageSchema.parse((body as { data?: unknown }).data);
      if (!alive.current || controller.signal.aborted) return;
      setRows((existing) => [
        ...new Map(
          (after ? [...existing, ...parsed.items] : parsed.items).map((row) => [row.id, row]),
        ).values(),
      ]);
      setCursor(parsed.nextCursor);
    } catch {
      if (alive.current && !controller.signal.aborted) setFailure('NETWORK');
    } finally {
      if (alive.current && !controller.signal.aborted) setPending(false);
    }
  }
  useEffect(() => {
    let active = true;
    alive.current = true;
    queueMicrotask(() => {
      if (active) void load(null);
    });
    return () => {
      active = false;
      alive.current = false;
      activeRequest.current?.abort();
    };
  }, [attempt]);
  if (pending && !rows.length) return <SavedLoading />;
  if (failure && !rows.length)
    return <ErrorState code={failure} onRetry={() => setAttempt((value) => value + 1)} />;
  if (!rows.length)
    return (
      <EmptyState
        title={t('emptyRemixesTitle')}
        description={t('emptyRemixesBody')}
        action={
          <Button asChild colorPalette="brand" size="lg">
            <Link href="/studio">{t('openStudio')}</Link>
          </Button>
        }
      />
    );
  return (
    <Stack gap="4">
      {rows.map((row) => (
        <Stack
          key={row.id}
          gap="3"
          p="5"
          bg="bg.panel"
          rounded="card"
          borderWidth="hairline"
          borderColor="border"
        >
          <Text as="h2" textStyle="heading.sm">
            {row.nameEn}
          </Text>
          <Text textStyle="caption" color="fg.muted">
            {t('updatedAt', {
              date: new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
                dateStyle: 'medium',
                timeZone: 'UTC',
              }).format(new Date(row.updatedAt)),
            })}
          </Text>
          <HStack flexWrap="wrap" gap="3">
            <Button asChild colorPalette="brand" size="lg">
              <Link href={{ pathname: '/studio', query: { remix: row.id } }}>
                {t('openStudio')}
              </Link>
            </Button>
            <Button
              variant="outline"
              colorPalette="red"
              size="lg"
              onClick={() => {
                setDeleteError(null);
                setSelected(row);
              }}
            >
              {t('deleteRemix')}
            </Button>
          </HStack>
        </Stack>
      ))}
      {failure ? (
        <ErrorState code={failure} onRetry={() => void load(cursor)} />
      ) : cursor ? (
        <Button variant="outline" size="lg" loading={pending} onClick={() => void load(cursor)}>
          {t('loadMore')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={t('deleteRemixTitle')}
        description={t('deleteRemixBody')}
        confirmLabel={t('deleteRemix')}
        errorCode={deleteError}
        onConfirm={async () => {
          if (!selected) return false;
          const result = await deleteRemix({ id: selected.id });
          if (!result.ok) {
            setDeleteError(result.error.code);
            return false;
          }
          setRows((existing) => existing.filter((row) => row.id !== selected.id));
          toaster.create({ type: 'success', title: t('remixDeleted') });
          return true;
        }}
      />
    </Stack>
  );
}
