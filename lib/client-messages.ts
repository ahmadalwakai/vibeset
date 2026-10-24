import type { AbstractIntlMessages, Messages } from 'next-intl';

const namespaces = {
  root: ['common', 'errors'],
  site: ['nav', 'home', 'explore', 'theme', 'studio', 'setup', 'saved', 'account', 'auth', 'legal'],
  auth: ['auth'],
  creator: ['creator'],
} as const satisfies Record<string, readonly (keyof Messages)[]>;

export type ClientMessageScope = keyof typeof namespaces | 'private';

/** Server translations retain the full dictionary; client providers receive their own namespaces. */
export function selectClientMessages(
  messages: Messages,
  scope: ClientMessageScope,
): AbstractIntlMessages {
  const selected: AbstractIntlMessages = {};
  if (scope === 'private') {
    for (const [namespace, value] of Object.entries(messages)) {
      if (namespace !== 'common' && namespace !== 'errors') selected[namespace] = value;
    }
  } else {
    for (const namespace of namespaces[scope]) selected[namespace] = messages[namespace];
  }
  return selected;
}
