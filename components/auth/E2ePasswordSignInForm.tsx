'use client';

import { Button, Field, Heading, Input, Separator, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import type { ErrorMessageCode } from '@/lib/result';
import { unlocalizeNextPath } from '@/lib/utils/next-path';
import { e2ePasswordSignInSchema } from '@/lib/validation/auth';

const subscribeToHydration = (): (() => void) => () => undefined;

/** Its parent is a server component and renders this form only for validated test auth. */
export function E2ePasswordSignInForm({
  callbackURL,
  databaseFingerprint,
}: {
  callbackURL: string;
  databaseFingerprint: string;
}): ReactElement {
  const t = useTranslations('auth.e2e');
  const auth = useTranslations('auth');
  const errors = useTranslations('errors');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const ready = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorMessageCode | 'credentials' | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (running.current) return;
    const input = e2ePasswordSignInSchema.safeParse({ email, password });
    setInvalid(!input.success);
    setError(null);
    if (!input.success) return;
    running.current = true;
    setPending(true);
    try {
      const result = await authClient.signIn.email({ ...input.data, callbackURL });
      if (!mounted.current) return;
      if (result.error) {
        setError(result.error.status === 429 ? 'RATE_LIMITED' : 'credentials');
        return;
      }
      setPassword('');
      router.replace(unlocalizeNextPath(callbackURL));
      router.refresh();
    } catch {
      if (mounted.current) setError(navigator.onLine ? 'NETWORK' : 'OFFLINE');
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <Stack
      gap="5"
      data-e2e-enabled="true"
      data-e2e-ready={String(ready)}
      data-database-fingerprint={databaseFingerprint}
    >
      <Separator />
      <Stack gap="2">
        <Heading as="h2" textStyle="heading.sm">
          {t('title')}
        </Heading>
        <Text textStyle="body.sm" color="fg.muted">
          {t('description')}
        </Text>
      </Stack>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Stack gap="4">
          <Field.Root invalid={invalid} disabled={pending || !ready}>
            <Field.Label htmlFor="e2e-email">{t('email')}</Field.Label>
            <Input
              id="e2e-email"
              name="email"
              type="email"
              autoComplete="username"
              dir="ltr"
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setInvalid(false);
              }}
            />
            <Field.ErrorText>{auth('emailInvalid')}</Field.ErrorText>
          </Field.Root>
          <Field.Root invalid={invalid} disabled={pending || !ready}>
            <Field.Label htmlFor="e2e-password">{t('password')}</Field.Label>
            <Input
              id="e2e-password"
              name="password"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              maxLength={128}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setInvalid(false);
              }}
            />
            <Field.ErrorText>{t('passwordInvalid')}</Field.ErrorText>
          </Field.Root>
          {error && (
            <Text role="alert" color="red.fg">
              {error === 'credentials' ? t('invalid') : errors(error)}
            </Text>
          )}
          <Button
            type="submit"
            minH="11"
            colorPalette="brand"
            rounded="button"
            loading={pending}
            disabled={pending || !ready}
          >
            {t('submit')}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
