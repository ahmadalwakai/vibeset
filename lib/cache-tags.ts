export const CacheTags = {
  themes: 'themes',
  theme: (slug: string): string => `theme:${slug}`,
  collections: 'collections',
  collection: (slug: string): string => `collection:${slug}`,
  taxonomy: 'taxonomy',
  apps: 'apps',
  settings: 'settings',
  creator: (handle: string): string => `creator:${handle}`,
} as const;

const staticTags = new Set<string>(
  Object.values(CacheTags).filter((value) => typeof value === 'string'),
);

export function isCacheTag(value: string): boolean {
  if (value.length > 256 || /\s/.test(value)) return false;
  if (staticTags.has(value)) return true;
  for (const prefix of [CacheTags.theme(''), CacheTags.collection('')]) {
    if (value.startsWith(prefix))
      return /^[a-z0-9][a-z0-9-]{0,159}$/.test(value.slice(prefix.length));
  }
  const creatorPrefix = CacheTags.creator('');
  return (
    value.startsWith(creatorPrefix) && /^[a-z0-9_]{3,24}$/.test(value.slice(creatorPrefix.length))
  );
}
