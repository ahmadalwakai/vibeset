'use client';

import { Button, Checkbox, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { CollectionForm } from '@/components/collections/CollectionForm';
import { toaster } from '@/components/ui/toaster';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import type { UserCollectionSummary } from '@/lib/collections';
import type { ErrorMessageCode } from '@/lib/result';
import {
  addToCollection,
  listCollections,
  removeFromCollection,
} from '@/server/actions/collections';

function CollectionPicker({ themeId }: { themeId: string }): ReactElement {
  const t = useTranslations('saved.collections'),
    errors = useTranslations('errors');
  const [rows, setRows] = useState<UserCollectionSummary[] | null>(null),
    [error, setError] = useState<ErrorMessageCode | null>(null),
    [attempt, setAttempt] = useState(0),
    [creating, setCreating] = useState(false),
    [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const mounted = useRef(false),
    busy = useRef(new Set<string>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void listCollections({ themeId })
      .then((result) => {
        if (!active) return;
        if (result.ok) setRows(result.data.collections);
        else setError(result.error.code);
      })
      .catch(() => {
        if (active) setError('NETWORK');
      });
    return () => {
      active = false;
    };
  }, [themeId, attempt]);
  async function toggle(row: UserCollectionSummary): Promise<void> {
    if (busy.current.has(row.id)) return;
    busy.current.add(row.id);
    setPending(new Set(busy.current));
    const selected = !row.containsTheme;
    setRows(
      (previous) =>
        previous?.map((value) =>
          value.id === row.id
            ? {
                ...value,
                containsTheme: selected,
                itemCount: Math.max(0, value.itemCount + (selected ? 1 : -1)),
              }
            : value,
        ) ?? null,
    );
    try {
      const result = await (selected ? addToCollection : removeFromCollection)({
        collectionId: row.id,
        themeId,
      });
      if (!mounted.current) return;
      if (!result.ok) {
        setRows(
          (previous) => previous?.map((value) => (value.id === row.id ? row : value)) ?? null,
        );
        toaster.create({
          type: 'error',
          title: result.error.fieldErrors?.limit?.includes('items')
            ? t('limitItems')
            : errors(result.error.code),
        });
      } else {
        setRows(
          (previous) =>
            previous?.map((value) =>
              value.id === row.id ? { ...value, itemCount: result.data.itemCount } : value,
            ) ?? null,
        );
        toaster.create({ type: 'success', title: t(selected ? 'added' : 'removed') });
      }
    } catch {
      if (mounted.current) {
        setRows(
          (previous) => previous?.map((value) => (value.id === row.id ? row : value)) ?? null,
        );
        toaster.create({ type: 'error', title: errors('NETWORK') });
      }
    } finally {
      busy.current.delete(row.id);
      if (mounted.current) setPending(new Set(busy.current));
    }
  }
  return (
    <Stack gap="5">
      {error ? (
        <Stack role="alert" gap="3">
          <Text textStyle="body.sm" color="red.fg">
            {errors(error)}
          </Text>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              setError(null);
              setRows(null);
              setAttempt((value) => value + 1);
            }}
          >
            {t('retry')}
          </Button>
        </Stack>
      ) : rows === null ? (
        <Stack gap="3" aria-busy="true">
          {[0, 1, 2].map((value) => (
            <Skeleton key={value} h="12" />
          ))}
        </Stack>
      ) : (
        <Stack gap="2">
          {rows.length ? (
            rows.map((row) => (
              <Checkbox.Root
                key={row.id}
                checked={row.containsTheme}
                disabled={pending.has(row.id)}
                onCheckedChange={() => void toggle(row)}
                minH="11"
                colorPalette="brand"
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label textStyle="body.md">
                  {row.titleEn}{' '}
                  <Text as="span" textStyle="caption" color="fg.muted">
                    {t('itemCount', { count: row.itemCount })}
                  </Text>
                </Checkbox.Label>
              </Checkbox.Root>
            ))
          ) : (
            <Text textStyle="body.sm" color="fg.muted">
              {t('emptyBody')}
            </Text>
          )}
        </Stack>
      )}
      {creating ? (
        <CollectionForm
          onSaved={(value) => {
            setRows((previous) => [value, ...(previous ?? [])]);
            setCreating(false);
          }}
        />
      ) : (
        <Button
          size="lg"
          variant="outline"
          disabled={rows === null || error !== null}
          onClick={() => setCreating(true)}
        >
          {t('newCollection')}
        </Button>
      )}
    </Stack>
  );
}

export function SaveToCollectionSheet({
  themeId,
  open,
  onOpenChange,
}: {
  themeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations('saved.collections'),
    session = authClient.useSession();
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('saveToCollection')}>
      {session.isPending ? (
        <Skeleton h="24" />
      ) : !session.data ? (
        <Stack gap="4">
          <Text as="h3" textStyle="heading.sm">
            {t('signInTitle')}
          </Text>
          <Text textStyle="body.md" color="fg.muted">
            {t('signInBody')}
          </Text>
          <Button asChild size="lg" colorPalette="brand">
            <Link href={{ pathname: '/sign-in', query: { next: '/saved' } }}>{t('signIn')}</Link>
          </Button>
        </Stack>
      ) : open ? (
        <CollectionPicker key={`${session.data.user.id}:${themeId}`} themeId={themeId} />
      ) : null}
    </ResponsiveSheet>
  );
}
