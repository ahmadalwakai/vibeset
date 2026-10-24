'use client';

import { Button, Field, Input, NativeSelect, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactElement, RefObject } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { ViewStatisticsControl } from '@/components/common/ViewStatisticsControl';
import { toaster } from '@/components/ui/toaster';
import { Link, useRouter } from '@/i18n/navigation';
import type { AccountProfile } from '@/lib/account';
import { authClient } from '@/lib/auth-client';
import { sessionErrorCode } from '@/lib/client/session-error';
import type { ErrorMessageCode } from '@/lib/result';
import { updateAccountSchema } from '@/lib/validation/account';
import { apiErrorSchema } from '@/lib/validation/themes';
import { updateAccount } from '@/server/actions/account';

export function AccountSettings({ profile }: { profile: AccountProfile }): ReactElement {
  const session = authClient.useSession();
  const currentOwner = useRef<string | null>(profile.id);
  useEffect(() => {
    if (!session.isPending) currentOwner.current = session.data?.user.id ?? null;
  }, [session.isPending, session.data?.user.id]);
  if (session.isPending) return <Skeleton h="96" rounded="card" />;
  if (!session.data && session.error)
    return (
      <ErrorState
        code={sessionErrorCode(session.error)}
        onRetry={() => void session.refetch()}
        retrying={session.isRefetching}
      />
    );
  if (session.data?.user.id !== profile.id) return <ErrorState code="UNAUTHENTICATED" />;
  return <AccountForm key={profile.id} profile={profile} currentOwner={currentOwner} />;
}

function AccountForm({
  profile,
  currentOwner,
}: {
  profile: AccountProfile;
  currentOwner: RefObject<string | null>;
}): ReactElement {
  const id = useId();
  const t = useTranslations('account');
  const errors = useTranslations('errors');
  const nav = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const color = useTheme();
  const [name, setName] = useState(profile.name);
  const [language, setLanguage] = useState<'en' | 'ar'>(profile.locale);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [failure, setFailure] = useState<ErrorMessageCode | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reauthenticate, setReauthenticate] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const exportRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      exportRequest.current?.abort();
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (inFlight.current) return;
    const input = updateAccountSchema.safeParse({ name, locale: language });
    setInvalid(!input.success);
    if (!input.success) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const result = await updateAccount(input.data);
      if (!mounted.current) return;
      if (!result.ok) {
        setFailure(result.error.code);
        return;
      }
      await authClient.getSession({ query: { disableCookieCache: true } });
      if (!mounted.current) return;
      toaster.create({ type: 'success', title: t('saved') });
      if (language !== locale) router.replace('/account', { locale: language });
      router.refresh();
    } catch {
      if (mounted.current) setFailure('NETWORK');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function exportData(): Promise<void> {
    if (exporting) return;
    exportRequest.current?.abort();
    const controller = new AbortController();
    exportRequest.current = controller;
    setExporting(true);
    try {
      const response = await fetch('/api/account/export', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) {
        const parsed = apiErrorSchema.safeParse(await response.json());
        if (!mounted.current || controller.signal.aborted) return;
        toaster.create({
          type: 'error',
          title: errors(parsed.success ? parsed.data.error.code : 'INTERNAL'),
        });
        return;
      }
      const blob = await response.blob();
      const { downloadFile } = await import('@/lib/client/share');
      if (!mounted.current || controller.signal.aborted) return;
      downloadFile(new File([blob], 'vibeset-account.json', { type: 'application/json' }));
      toaster.create({ type: 'success', title: t('exported') });
    } catch {
      if (mounted.current && !controller.signal.aborted)
        toaster.create({ type: 'error', title: errors('NETWORK') });
    } finally {
      if (mounted.current && !controller.signal.aborted) setExporting(false);
    }
  }

  async function deleteAccount(): Promise<boolean> {
    setFailure(null);
    try {
      const result = await authClient.deleteUser();
      if (currentOwner.current !== null && currentOwner.current !== profile.id) return true;
      if (!mounted.current && currentOwner.current !== null) return true;
      if (result.error) {
        if (result.error.code === 'SESSION_EXPIRED') setReauthenticate(true);
        setFailure(result.error.code === 'SESSION_EXPIRED' ? 'UNAUTHENTICATED' : 'INTERNAL');
        return false;
      }
      // Better Auth already deletes the session and clears its cookie on success.
      // A second signOut could revoke a different account after an account switch.
      router.replace('/');
      router.refresh();
      toaster.create({ type: 'success', title: t('deleted') });
      return true;
    } catch {
      if (mounted.current) setFailure('NETWORK');
      return false;
    }
  }

  return (
    <Stack gap="8" pb="12" maxW="2xl">
      <ViewStatisticsControl />
      <Stack
        as="section"
        gap="5"
        p={{ base: '5', md: '6' }}
        bg="bg.panel"
        rounded="card"
        borderWidth="hairline"
        borderColor="border"
      >
        <Text as="h2" textStyle="heading.md">
          {t('profileTitle')}
        </Text>
        <form onSubmit={(event) => void save(event)}>
          <Stack gap="5">
            <Field.Root invalid={invalid} disabled={busy}>
              <Field.Label htmlFor={`${id}-name`}>{t('name')}</Field.Label>
              <Input
                id={`${id}-name`}
                name="name"
                autoComplete="name"
                value={name}
                maxLength={60}
                minH="11"
                onChange={(event) => {
                  setName(event.target.value);
                  setInvalid(false);
                }}
              />
              <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
            </Field.Root>
            <Field.Root>
              <Field.Label htmlFor={`${id}-email`}>{t('email')}</Field.Label>
              <Input id={`${id}-email`} type="email" value={profile.email} readOnly minH="11" />
            </Field.Root>
            <Field.Root disabled={busy}>
              <Field.Label htmlFor={`${id}-language`}>{t('language')}</Field.Label>
              <NativeSelect.Root size="lg">
                <NativeSelect.Field
                  id={`${id}-language`}
                  value={language}
                  onChange={(event) => setLanguage(event.target.value === 'ar' ? 'ar' : 'en')}
                >
                  <option value="en" lang="en">
                    {nav('languages.en')}
                  </option>
                  <option value="ar" lang="ar">
                    {nav('languages.ar')}
                  </option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
            <Field.Root>
              <Field.Label htmlFor={`${id}-color-mode`}>{t('colourMode')}</Field.Label>
              <NativeSelect.Root size="lg">
                <NativeSelect.Field
                  id={`${id}-color-mode`}
                  value={color.theme ?? 'system'}
                  onChange={(event) => color.setTheme(event.target.value)}
                >
                  <option value="system">{t('system')}</option>
                  <option value="light">{t('light')}</option>
                  <option value="dark">{t('dark')}</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
            {failure ? (
              <Text role="alert" textStyle="body.sm" color="red.fg">
                {errors(failure)}
              </Text>
            ) : null}
            <Button type="submit" colorPalette="brand" size="lg" alignSelf="start" loading={busy}>
              {t('save')}
            </Button>
          </Stack>
        </form>
      </Stack>
      <Stack
        as="section"
        gap="3"
        p={{ base: '5', md: '6' }}
        bg="bg.panel"
        rounded="card"
        borderWidth="hairline"
        borderColor="border"
      >
        <Text as="h2" textStyle="heading.md">
          {t('creatorTitle')}
        </Text>
        <Text textStyle="body.sm" color="fg.muted">
          {t('creatorDescription')}
        </Text>
        <Button asChild colorPalette="brand" size="lg" minH="11" alignSelf="start">
          <Link href="/become-creator">{t('creatorAction')}</Link>
        </Button>
      </Stack>
      <Stack
        as="section"
        gap="3"
        p={{ base: '5', md: '6' }}
        bg="bg.panel"
        rounded="card"
        borderWidth="hairline"
        borderColor="border"
      >
        <Text as="h2" textStyle="heading.md">
          {t('exportTitle')}
        </Text>
        <Text textStyle="body.sm" color="fg.muted">
          {t('exportDescription')}
        </Text>
        <Button
          variant="outline"
          size="lg"
          alignSelf="start"
          loading={exporting}
          onClick={() => void exportData()}
        >
          {t(exporting ? 'exporting' : 'exportButton')}
        </Button>
      </Stack>
      <Stack
        as="section"
        gap="3"
        p={{ base: '5', md: '6' }}
        bg="bg.panel"
        rounded="card"
        borderWidth="hairline"
        borderColor="border"
      >
        <Text as="h2" textStyle="heading.md">
          {t('deleteTitle')}
        </Text>
        <Text textStyle="body.sm" color="fg.muted">
          {t('deleteDescription')}
        </Text>
        <Text textStyle="body.sm" color="fg.muted">
          {t('deletePublishedNote')}
        </Text>
        {reauthenticate ? (
          <Button
            variant="outline"
            size="lg"
            onClick={async () => {
              try {
                const result = await authClient.signOut();
                if (result.error) throw new Error('Sign out failed');
                router.push({ pathname: '/sign-in', query: { next: '/account' } });
                router.refresh();
              } catch {
                toaster.create({ type: 'error', title: t('signOutFailed') });
              }
            }}
          >
            {t('reauthenticate')}
          </Button>
        ) : null}
        <Button
          colorPalette="red"
          variant="outline"
          size="lg"
          alignSelf="start"
          onClick={() => {
            setFailure(null);
            setConfirming(true);
          }}
        >
          {t('deleteButton')}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          alignSelf="start"
          onClick={async () => {
            try {
              const result = await authClient.signOut();
              if (result.error) throw new Error('Sign out failed');
              router.replace('/');
              router.refresh();
            } catch {
              toaster.create({ type: 'error', title: t('signOutFailed') });
            }
          }}
        >
          {t('signOut')}
        </Button>
      </Stack>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDescription')}
        confirmLabel={t('deleteButton')}
        confirmationText={t('deleteWord')}
        errorCode={failure}
        onConfirm={deleteAccount}
      />
    </Stack>
  );
}
