import {
  NextIntlClientProvider,
  useLocale,
  useMessages,
  useTimeZone,
  useTranslations,
} from 'next-intl';
import type { AbstractIntlMessages, IntlError, Messages } from 'next-intl';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClientMessages } from '../../../components/common/ClientMessages';
import { selectClientMessages } from '../../../lib/client-messages';
import type { ClientMessageScope } from '../../../lib/client-messages';
import ar from '../../../messages/ar.json';
import en from '../../../messages/en.json';

const dictionaries = [
  { locale: 'en', messages: en },
  { locale: 'ar', messages: ar },
] as const;
const siteNamespaces = [
  'nav',
  'home',
  'explore',
  'theme',
  'studio',
  'setup',
  'saved',
  'account',
  'auth',
  'legal',
];
interface ObservedContext {
  locale: string;
  timeZone: string | undefined;
  messages: AbstractIntlMessages;
  save: string;
  network: string;
}

/** Exercise the actual client entry and hooks: mocking the provider hides locale failures. */
function renderScopes(
  locale: 'en' | 'ar',
  messages: Messages,
  scopes: readonly ClientMessageScope[],
  overlay?: AbstractIntlMessages,
): ObservedContext {
  let observed: ObservedContext | undefined;
  function Probe(): ReactElement {
    const common = useTranslations('common');
    const errors = useTranslations('errors');
    observed = {
      locale: useLocale(),
      timeZone: useTimeZone(),
      messages: useMessages(),
      save: common('save'),
      network: errors('NETWORK'),
    };
    return createElement('output', { lang: observed.locale }, observed.save);
  }
  let children: ReactElement = createElement(Probe);
  if (overlay) {
    const props = { messages: overlay, children };
    children = createElement(ClientMessages, props);
  }
  for (const scope of [...scopes].reverse()) {
    const props = { messages: selectClientMessages(messages, scope), children };
    children = createElement(ClientMessages, props);
  }
  const props = {
    locale,
    timeZone: 'UTC',
    messages: selectClientMessages(messages, 'root'),
    onError: (error: IntlError): never => {
      throw error;
    },
    children,
  };
  renderToStaticMarkup(createElement(NextIntlClientProvider, props));
  if (!observed) throw new Error('The translation probe did not render');
  return observed;
}

describe.each(dictionaries)('$locale client message boundaries', ({ locale, messages }) => {
  it('keeps only shared error/recovery strings at the root', () => {
    const selected = selectClientMessages(messages, 'root');
    expect(Object.keys(selected).sort()).toEqual(['common', 'errors']);
    expect(selected.common).toBe(messages.common);
    expect(selected.errors).toBe(messages.errors);
    expect(selected).not.toHaveProperty('admin');
    expect(selected).not.toHaveProperty('creator');
    expect(selected).not.toHaveProperty('studio');
  });

  it('retains public navigation, export, saved, account and legal consumers without private tools', () => {
    const selected = selectClientMessages(messages, 'site');
    expect(Object.keys(selected).sort()).toEqual([...siteNamespaces].sort());
    expect(selected.theme).toBe(messages.theme);
    expect(selected.studio).toBe(messages.studio);
    expect(selected.legal).toBe(messages.legal);
    expect(selected).not.toHaveProperty('admin');
    expect(selected).not.toHaveProperty('creator');
    expect(selected).not.toHaveProperty('common');
    expect(selected).not.toHaveProperty('errors');
  });

  it('keeps auth and creator additions separate from unrelated namespaces', () => {
    expect(selectClientMessages(messages, 'auth')).toEqual({ auth: messages.auth });
    expect(selectClientMessages(messages, 'creator')).toEqual({ creator: messages.creator });
  });

  it('retains all private tools, including shared Studio and creator fields, without resending root strings', () => {
    const selected = selectClientMessages(messages, 'private');
    expect(Object.keys(selected).sort()).toEqual([...siteNamespaces, 'creator', 'admin'].sort());
    expect(selected.admin).toBe(messages.admin);
    expect(selected.creator).toBe(messages.creator);
    expect(selected.studio).toBe(messages.studio);
    expect(selected).not.toHaveProperty('common');
    expect(selected).not.toHaveProperty('errors');
  });

  it('renders nested site/Studio additions with inherited locale, timezone and root messages', () => {
    const observed = renderScopes(locale, messages, ['site', 'creator']);
    expect(observed.locale).toBe(locale);
    expect(observed.timeZone).toBe('UTC');
    expect(observed.save).toBe(messages.common.save);
    expect(observed.network).toBe(messages.errors.NETWORK);
    expect(Object.keys(observed.messages).sort()).toEqual(
      ['common', 'errors', ...siteNamespaces, 'creator'].sort(),
    );
    expect(observed.messages.studio).toBe(messages.studio);
    expect(observed.messages.creator).toBe(messages.creator);
    expect(observed.messages).not.toHaveProperty('admin');
  });

  it('renders auth with shared error/recovery translations and no site or private payload', () => {
    const observed = renderScopes(locale, messages, ['auth']);
    expect(observed.locale).toBe(locale);
    expect(observed.save).toBe(messages.common.save);
    expect(observed.network).toBe(messages.errors.NETWORK);
    expect(Object.keys(observed.messages).sort()).toEqual(['auth', 'common', 'errors']);
  });

  it('renders private providers with complete inherited namespaces', () => {
    const observed = renderScopes(locale, messages, ['private']);
    expect(observed.locale).toBe(locale);
    expect(observed.messages).toEqual(messages);
    expect(observed.save).toBe(messages.common.save);
    expect(observed.network).toBe(messages.errors.NETWORK);
  });
});

it('lets a nested namespace override win without mutating the source dictionary or losing siblings', () => {
  const original = structuredClone(en);
  const observed = renderScopes('en', en, ['site'], {
    common: { ...en.common, save: 'Save this version' },
  });
  expect(observed.save).toBe('Save this version');
  expect(observed.network).toBe(en.errors.NETWORK);
  expect(observed.messages.theme).toBe(en.theme);
  expect(en).toEqual(original);
});
