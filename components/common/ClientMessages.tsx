'use client';

import { NextIntlClientProvider, useLocale, useMessages } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import { useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';

/** next-intl replaces messages atomically, so explicitly retain the parent namespaces. */
export function ClientMessages({
  messages,
  children,
}: {
  messages: AbstractIntlMessages;
  children: ReactNode;
}): ReactElement {
  const locale = useLocale();
  const inherited = useMessages();
  const combined = useMemo(() => ({ ...inherited, ...messages }), [inherited, messages]);
  return (
    <NextIntlClientProvider locale={locale} messages={combined}>
      {children}
    </NextIntlClientProvider>
  );
}
