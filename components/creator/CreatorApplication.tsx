'use client';

import { Badge, Button, Checkbox, Field, Input, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { toaster } from '@/components/ui/toaster';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { sessionErrorCode } from '@/lib/client/session-error';
import type { CreatorContext, CreatorLink } from '@/lib/creator';
import type { ErrorMessageCode } from '@/lib/result';
import { applyForCreatorSchema, creatorHandleSchema } from '@/lib/validation/creator';
import { applyForCreator, checkHandle } from '@/server/actions/creator';
import { CreatorProfileFields } from './CreatorProfileFields';
import { applicationStatus, applicationVersion } from './application-state';

function ApplicationForm({
  initial,
  onSent,
}: {
  initial: CreatorContext | null;
  onSent: () => void;
}): ReactElement {
  const t = useTranslations('creator.application');
  const fields = useTranslations('creator.fields');
  const errors = useTranslations('errors');
  const id = useId();
  const [handle, setHandle] = useState(initial?.handle ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [links, setLinks] = useState<CreatorLink[]>(initial?.links ?? []);
  const [adult, setAdult] = useState(initial?.isAdult ?? false);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [error, setError] = useState<ErrorMessageCode | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [availability, setAvailability] = useState<{
    handle: string;
    state: 'available' | 'taken' | 'error';
  } | null>(null);
  const mounted = useRef(false),
    busy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const validHandle = creatorHandleSchema.safeParse(handle).success;
  const checked = availability?.handle === handle ? availability.state : null;
  useEffect(() => {
    if (!creatorHandleSchema.safeParse(handle).success) return;
    let active = true;
    const timer = setTimeout(() => {
      void checkHandle({ handle })
        .then((result) => {
          if (active)
            setAvailability({
              handle,
              state: result.ok ? (result.data.available ? 'available' : 'taken') : 'error',
            });
        })
        .catch(() => {
          if (active) setAvailability({ handle, state: 'error' });
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [handle, attempt]);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy.current) return;
    const parsed = applyForCreatorSchema.safeParse({
      handle,
      displayName,
      bio,
      links,
      isAdult: adult,
    });
    if (!parsed.success) {
      setInvalid([...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    setInvalid([]);
    try {
      const result = await applyForCreator(parsed.data);
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error.code);
        setInvalid(Object.keys(result.error.fieldErrors ?? {}));
        return;
      }
      toaster.create({ type: 'success', title: t('sent') });
      onSent();
    } catch {
      if (mounted.current) setError('NETWORK');
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <Stack
        gap="5"
        p={{ base: '4', md: '6' }}
        rounded="card"
        borderWidth="hairline"
        borderColor="border"
        bg="bg.panel"
      >
        <Text as="h2" textStyle="heading.md">
          {t(initial ? 'reapply' : 'formTitle')}
        </Text>
        <Field.Root
          invalid={
            invalid.includes('handle') || (handle.length > 0 && !validHandle) || checked === 'taken'
          }
        >
          <Field.Label htmlFor={`${id}-handle`}>{fields('handle')}</Field.Label>
          <Input
            id={`${id}-handle`}
            value={handle}
            minH="11"
            maxLength={24}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            disabled={pending}
            onChange={(event) => {
              setHandle(event.target.value.toLowerCase());
              setInvalid([]);
            }}
          />
          <Field.HelperText>{t('handleHint')}</Field.HelperText>
          {handle ? (
            <Text
              textStyle="caption"
              color={checked === 'available' ? 'brand.fg' : 'fg.muted'}
              role="status"
            >
              {t(
                !validHandle
                  ? 'handleInvalid'
                  : checked === 'taken'
                    ? 'handleTaken'
                    : checked === 'available'
                      ? 'handleAvailable'
                      : checked === 'error'
                        ? 'handleCheckFailed'
                        : 'handleChecking',
              )}
            </Text>
          ) : null}
          {checked === 'error' ? (
            <Button
              variant="outline"
              minH="11"
              disabled={pending}
              onClick={() => {
                setAvailability(null);
                setAttempt((value) => value + 1);
              }}
            >
              {t('handleRetry')}
            </Button>
          ) : null}
        </Field.Root>
        <CreatorProfileFields
          displayName={displayName}
          bio={bio}
          links={links}
          onDisplayName={setDisplayName}
          onBio={setBio}
          onLinks={setLinks}
          disabled={pending}
          invalid={invalid}
        />
        <Text textStyle="caption" color="fg.muted">
          {t('linksHint')}
        </Text>
        <Field.Root invalid={invalid.includes('isAdult')}>
          <Checkbox.Root
            checked={adult}
            onCheckedChange={({ checked }) => setAdult(checked === true)}
            minH="11"
            disabled={pending}
            colorPalette="brand"
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label>{t('adultLabel')}</Checkbox.Label>
          </Checkbox.Root>
          <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
        </Field.Root>
        {error ? (
          <Text role="alert" textStyle="body.sm" color="red.fg">
            {errors(error)}
          </Text>
        ) : null}
        <Button
          type="submit"
          colorPalette="brand"
          minH="11"
          loading={pending}
          loadingText={t('submitting')}
          disabled={!validHandle || checked !== 'available'}
        >
          {t('submit')}
        </Button>
      </Stack>
    </form>
  );
}

export function CreatorApplication({
  ownerId,
  profile,
  applicationsOpen,
}: {
  ownerId: string;
  profile: CreatorContext | null;
  applicationsOpen: boolean;
}): ReactElement {
  const session = authClient.useSession();
  if (session.isPending)
    return (
      <Stack gap="5">
        <Skeleton h="48" rounded="card" />
        <Skeleton h="96" rounded="card" />
      </Stack>
    );
  if (!session.data && session.error)
    return (
      <ErrorState
        code={sessionErrorCode(session.error)}
        onRetry={() => void session.refetch()}
        retrying={session.isRefetching}
      />
    );
  if (session.data?.user.id !== ownerId) return <ErrorState code="UNAUTHENTICATED" />;
  return <ApplicationContent key={ownerId} profile={profile} applicationsOpen={applicationsOpen} />;
}

function ApplicationContent({
  profile,
  applicationsOpen,
}: {
  profile: CreatorContext | null;
  applicationsOpen: boolean;
}): ReactElement {
  const t = useTranslations('creator.application');
  const statusLabel = useTranslations('creator.status');
  const router = useRouter();
  const [submittedVersion, setSubmittedVersion] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const status = applicationStatus(profile, submittedVersion);
  return (
    <Stack gap="6" maxW="3xl">
      <Stack gap="3" p="5" bg="bg.subtle" rounded="card">
        <Text as="h2" textStyle="heading.md">
          {t('explainerTitle')}
        </Text>
        <Text>{t('explainerBody')}</Text>
        <Text as="h3" textStyle="heading.sm">
          {t('rulesTitle')}
        </Text>
        <Stack as="ul" gap="2" ps="5">
          {(['ownImages', 'noBrands', 'adult'] as const).map((rule) => (
            <Text as="li" key={rule}>
              {t(`rules.${rule}`)}
            </Text>
          ))}
        </Stack>
      </Stack>
      {status ? (
        <Stack
          gap="3"
          p="5"
          bg="bg.panel"
          rounded="card"
          borderWidth="hairline"
          borderColor="border"
        >
          <Badge alignSelf="start" colorPalette={status === 'approved' ? 'brand' : 'gray'}>
            {statusLabel(status)}
          </Badge>
          <Text as="h2" textStyle="heading.md">
            {t(`${status}Title`)}
          </Text>
          <Text textStyle="body.md" color="fg.muted">
            {t(`${status}Body`)}
          </Text>
          {profile?.rejectionReason && (status === 'rejected' || status === 'suspended') ? (
            <Text overflowWrap="anywhere">{profile.rejectionReason}</Text>
          ) : null}
          {status === 'approved' ? (
            <Button asChild colorPalette="brand" minH="11">
              <Link href="/creator">{t('openDashboard')}</Link>
            </Button>
          ) : (
            <Button
              minH="11"
              variant="outline"
              loading={refreshing}
              onClick={() => startRefresh(() => router.refresh())}
            >
              {t('refresh')}
            </Button>
          )}
        </Stack>
      ) : null}
      {!status || status === 'rejected' ? (
        applicationsOpen ? (
          <ApplicationForm
            key={profile?.updatedAt ?? 'new'}
            initial={profile}
            onSent={() => {
              setSubmittedVersion(applicationVersion(profile));
              router.refresh();
            }}
          />
        ) : (
          <EmptyState
            title={t('closedTitle')}
            description={t('closedBody')}
            action={
              <Button asChild colorPalette="brand" minH="11">
                <Link href="/studio">{t('openStudio')}</Link>
              </Button>
            }
          />
        )
      ) : null}
    </Stack>
  );
}
