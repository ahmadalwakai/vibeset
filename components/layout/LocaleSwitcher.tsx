'use client';

import { Button, Icon, Skeleton } from '@chakra-ui/react';
import { GlobeIcon } from '@phosphor-icons/react/dist/csr/Globe';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useTransition } from 'react';
import type { ReactElement } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

interface LocaleSwitcherProps {
  compact?: boolean;
}

function LocaleSwitcherContent({ compact = false }: LocaleSwitcherProps): ReactElement {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const targetLocale =
    routing.locales.find((candidate) => candidate !== locale) ?? routing.defaultLocale;
  const language = t(`languages.${targetLocale}`);

  function switchLocale(): void {
    const query = Object.fromEntries(
      Array.from(new Set(searchParams.keys()), (key): [string, string | string[]] => {
        const values = searchParams.getAll(key);
        return [key, values.length === 1 ? (values[0] ?? '') : values];
      }),
    );

    startTransition(() => {
      router.replace({ pathname, query }, { locale: targetLocale, scroll: false });
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      h="11"
      minW="11"
      px={compact ? '0' : '3'}
      rounded="button"
      loading={pending}
      aria-label={t('switchLanguage', { language })}
      onClick={switchLocale}
    >
      <Icon asChild boxSize="5">
        <GlobeIcon aria-hidden weight="regular" />
      </Icon>
      {!compact ? <span lang={targetLocale}>{language}</span> : null}
    </Button>
  );
}

export function LocaleSwitcher({ compact = false }: LocaleSwitcherProps): ReactElement {
  return (
    <Suspense fallback={<Skeleton h="11" w={compact ? '11' : '28'} rounded="button" />}>
      <LocaleSwitcherContent compact={compact} />
    </Suspense>
  );
}
