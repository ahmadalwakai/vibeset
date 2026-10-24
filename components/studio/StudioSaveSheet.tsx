'use client';

import { Button, Field, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { ErrorState } from '@/components/common/ErrorState';
import { toaster } from '@/components/ui/toaster';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { sessionErrorCode } from '@/lib/client/session-error';
import type { ThemeSpec } from '@/lib/render/spec';
import type { ErrorMessageCode } from '@/lib/result';
import type { StudioSavedIdentity } from '@/lib/studio-entry';
import { remixNameSchema } from '@/lib/validation/remixes';
import { saveRemix, updateRemix } from '@/server/actions/studio';

export function StudioSaveSheet({
  spec,
  sourceSlug,
  initialRemix,
  open,
  onOpenChange,
  flushDraft,
  onSaved,
}: {
  spec: ThemeSpec;
  sourceSlug: string | null;
  initialRemix?: StudioSavedIdentity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flushDraft: () => void;
  onSaved: () => void;
}): ReactElement {
  const t = useTranslations('studio.save');
  const errors = useTranslations('errors');
  const session = authClient.useSession();
  const id = useId();
  const [name, setName] = useState(initialRemix?.nameEn ?? '');
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorMessageCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedRemix, setSavedRemix] = useState<{ id: string; ownerId: string } | null>(
    initialRemix ?? null,
  );
  const ownerId = session.data?.user.id ?? null;
  const currentOwner = useRef(ownerId);
  useEffect(() => {
    currentOwner.current = ownerId;
  }, [ownerId]);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending.current) return;
    if (!ownerId) return;
    const parsed = remixNameSchema.safeParse(name);
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    setInvalid(false);
    flushDraft();
    try {
      const result =
        savedRemix?.ownerId === ownerId
          ? await updateRemix({ id: savedRemix.id, spec, nameEn: parsed.data })
          : await saveRemix({
              spec,
              nameEn: parsed.data,
              ...(sourceSlug ? { remixOfSlug: sourceSlug } : {}),
            });
      if (!mounted.current || currentOwner.current !== ownerId) return;
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      setSavedRemix({ id: result.data.id, ownerId });
      onSaved();
      onOpenChange(false);
      toaster.create({ type: 'success', title: t('saved') });
    } catch {
      if (mounted.current) setError('NETWORK');
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <ResponsiveSheet
      title={t('title')}
      open={open}
      onOpenChange={(value) => {
        if (!pending.current) onOpenChange(value);
      }}
    >
      {session.isPending ? (
        <Stack align="center" py="6">
          <Spinner />
        </Stack>
      ) : !session.data && session.error ? (
        <ErrorState
          code={sessionErrorCode(session.error)}
          onRetry={() => void session.refetch()}
          retrying={session.isRefetching}
        />
      ) : !session.data ? (
        <Stack gap="4">
          <Text as="h3" textStyle="heading.sm">
            {t('signInTitle')}
          </Text>
          <Text color="fg.muted">{t('signInBody')}</Text>
          <Button asChild colorPalette="brand" size="lg">
            <Link
              href={{
                pathname: '/sign-in',
                query: { next: initialRemix ? `/studio?remix=${initialRemix.id}` : '/studio' },
              }}
              onClick={flushDraft}
            >
              {t('signIn')}
            </Link>
          </Button>
        </Stack>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <Stack gap="5">
            <Field.Root invalid={invalid}>
              <Field.Label htmlFor={id}>{t('name')}</Field.Label>
              <Input
                id={id}
                autoComplete="off"
                maxLength={60}
                value={name}
                minH="11"
                placeholder={t('labelPlaceholder')}
                disabled={saving}
                onChange={(event) => {
                  setName(event.target.value);
                  setInvalid(false);
                }}
              />
              {invalid ? <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText> : null}
            </Field.Root>
            {error ? (
              <Text role="alert" textStyle="body.sm" color="red.fg">
                {error === 'FORBIDDEN' &&
                (spec.wallpaper.kind === 'image' || spec.lockWallpaper?.kind === 'image')
                  ? t('photoForbidden')
                  : errors(error)}
              </Text>
            ) : null}
            <Button type="submit" colorPalette="brand" size="lg" loading={saving}>
              {t('submit')}
            </Button>
          </Stack>
        </form>
      )}
    </ResponsiveSheet>
  );
}
