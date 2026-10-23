'use client';

import {
  Alert,
  Button,
  Field,
  Heading,
  Icon,
  Input,
  Separator,
  Stack,
  Text,
} from '@chakra-ui/react';
import {
  CheckCircleIcon,
  EnvelopeSimpleIcon,
  GoogleLogoIcon,
  SignOutIcon,
} from '@phosphor-icons/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { z } from 'zod';
import { getPathname, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import type { ErrorMessageCode } from '@/lib/result';
import { formatNumber } from '@/lib/utils/format';
import { emailSignInSchema } from '@/lib/validation/auth';

const authErrorSchema = z.object({ status: z.number().optional(), code: z.string().optional() });

function errorCode(error: unknown): ErrorMessageCode {
  const result = authErrorSchema.safeParse(error);
  if (!result.success) return 'INTERNAL';
  if (result.data.status === 429 || /RATE_LIMIT|TOO_MANY/.test(result.data.code ?? ''))
    return 'RATE_LIMITED';
  if (
    result.data.status === 403 ||
    result.data.code === 'USER_BANNED' ||
    result.data.code === 'BANNED_USER'
  )
    return 'FORBIDDEN';
  return 'INTERNAL';
}

export function SignInForm({
  callbackURL,
  googleAvailable,
  magicLinkAvailable,
  callbackError,
  banned,
}: {
  callbackURL: string;
  googleAvailable: boolean;
  magicLinkAvailable: boolean;
  callbackError: boolean;
  banned: boolean;
}): ReactElement {
  const t = useTranslations('auth');
  const errors = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<'google' | 'email' | 'sign-out' | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [invalidEmail, setInvalidEmail] = useState(false);
  const [error, setError] = useState<ErrorMessageCode | null>(callbackError ? 'INTERNAL' : null);
  const resendDeadline = useRef(0);
  const errorCallbackURL = getPathname({
    href: { pathname: '/sign-in', query: { next: callbackURL } },
    locale,
  });

  useEffect(() => {
    if (remaining <= 0) return;
    const timeout = window.setTimeout(() => {
      setRemaining(Math.max(0, Math.ceil((resendDeadline.current - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [remaining]);

  async function signInWithGoogle(): Promise<void> {
    if (!googleAvailable || pending || banned) return;
    setPending('google');
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL,
      });
      if (result.error || !result.data?.url) setError(errorCode(result.error));
    } catch {
      setError(navigator.onLine ? 'NETWORK' : 'OFFLINE');
    } finally {
      setPending(null);
    }
  }

  async function sendLink(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    if (!magicLinkAvailable || pending || remaining > 0 || banned) return;
    const parsed = emailSignInSchema.safeParse({ email: sentEmail ?? email });
    setInvalidEmail(!parsed.success);
    if (!parsed.success) return;
    setPending('email');
    setError(null);
    try {
      const result = await authClient.signIn.magicLink({
        email: parsed.data.email,
        callbackURL,
        newUserCallbackURL: callbackURL,
        errorCallbackURL,
      });
      if (result.error || !result.data?.status) {
        setError(errorCode(result.error));
        return;
      }
      setSentEmail(parsed.data.email);
      resendDeadline.current = Date.now() + 30_000;
      setRemaining(30);
    } catch {
      setError(navigator.onLine ? 'NETWORK' : 'OFFLINE');
    } finally {
      setPending(null);
    }
  }

  async function signOut(): Promise<void> {
    if (pending) return;
    setPending('sign-out');
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error || !result.data?.success) {
        setError(errorCode(result.error));
        return;
      }
      router.refresh();
    } catch {
      setError(navigator.onLine ? 'NETWORK' : 'OFFLINE');
    } finally {
      setPending(null);
    }
  }

  if (banned)
    return (
      <Stack gap="5">
        <Heading as="h1" textStyle="heading.md">
          {t('bannedTitle')}
        </Heading>
        <Text color="fg.muted">{t('bannedDescription')}</Text>
        {error && (
          <Text role="alert" color="red.fg">
            {errors(error)}
          </Text>
        )}
        <Button
          size="lg"
          colorPalette="brand"
          rounded="button"
          onClick={signOut}
          loading={pending === 'sign-out'}
        >
          <Icon asChild boxSize="5">
            <SignOutIcon aria-hidden />
          </Icon>
          {t('signOut')}
        </Button>
      </Stack>
    );

  return (
    <Stack gap="6">
      <Stack gap="2">
        <Heading as="h1" textStyle="display.lg">
          {t('signInTitle')}
        </Heading>
        <Text textStyle="body.sm" color="fg.muted">
          {t('signInDescription')}
        </Text>
      </Stack>
      {error && (
        <Alert.Root status="error" rounded="input">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('errorTitle')}</Alert.Title>
            <Alert.Description>{errors(error)}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <Stack gap="2">
        <Button
          size="lg"
          variant="outline"
          rounded="button"
          onClick={signInWithGoogle}
          disabled={!googleAvailable || pending !== null}
          loading={pending === 'google'}
        >
          <Icon asChild boxSize="5">
            <GoogleLogoIcon aria-hidden />
          </Icon>
          {t('continueGoogle')}
        </Button>
        {!googleAvailable && (
          <Text textStyle="caption" color="fg.muted">
            {t('googleUnavailable')}
          </Text>
        )}
      </Stack>
      <Separator />
      {!magicLinkAvailable && (
        <Text textStyle="body.sm" color="fg.muted">
          {t('emailUnavailable')}
        </Text>
      )}
      {sentEmail ? (
        <Stack gap="5">
          <Icon asChild boxSize="10" color="brand.fg">
            <CheckCircleIcon aria-hidden weight="duotone" />
          </Icon>
          <Heading as="h2" textStyle="heading.md">
            {t('checkInbox')}
          </Heading>
          <Text color="fg.muted" role="status">
            {t('sentDescription', { email: sentEmail })}
          </Text>
          <Text textStyle="body.sm" color="fg.muted">
            {t('expiry')}
          </Text>
          <Button
            size="lg"
            colorPalette="brand"
            rounded="button"
            disabled={pending !== null || remaining > 0 || !magicLinkAvailable}
            loading={pending === 'email'}
            onClick={() => void sendLink()}
          >
            {remaining > 0
              ? t('resendIn', { seconds: formatNumber(remaining, locale) })
              : t('resend')}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            rounded="button"
            disabled={pending !== null}
            onClick={() => {
              setSentEmail(null);
              setError(null);
            }}
          >
            {t('changeEmail')}
          </Button>
        </Stack>
      ) : (
        <form onSubmit={(event) => void sendLink(event)} noValidate>
          <Stack gap="5">
            <Field.Root invalid={invalidEmail} disabled={!magicLinkAvailable}>
              <Field.Label htmlFor="sign-in-email">{t('emailLabel')}</Field.Label>
              <Input
                id="sign-in-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                dir="ltr"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setInvalidEmail(false);
                }}
                disabled={!magicLinkAvailable || pending !== null}
                size="lg"
                rounded="input"
              />
              <Field.ErrorText>{t('emailInvalid')}</Field.ErrorText>
              <Field.HelperText>{t('emailHint')}</Field.HelperText>
            </Field.Root>
            <Button
              type="submit"
              w="full"
              size="lg"
              colorPalette="brand"
              rounded="button"
              disabled={!magicLinkAvailable || pending !== null || remaining > 0}
              loading={pending === 'email'}
            >
              <Icon asChild boxSize="5">
                <EnvelopeSimpleIcon aria-hidden />
              </Icon>
              {remaining > 0
                ? t('resendIn', { seconds: formatNumber(remaining, locale) })
                : t('sendLink')}
            </Button>
          </Stack>
        </form>
      )}
      <Text textStyle="caption" color="fg.muted">
        {t('noPassword')}
      </Text>
    </Stack>
  );
}
