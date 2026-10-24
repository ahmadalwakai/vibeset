import type { ThemeCardDTO } from './api';
import { blockedCreatorSchema, MAX_BLOCKED_CREATORS } from './creator-blocks';
import type { createPreferencesStore } from './preferences';

type Store = ReturnType<typeof createPreferencesStore>;

/** Caller serializes with widget apply/clear; storage must be read before any native side effect. */
export async function hideContentOnDevice(
  store: Store,
  theme: ThemeCardDTO,
  kind: 'theme' | 'creator',
  clearWidget: () => Promise<void>,
): Promise<void> {
  await store.requireKnownBaseline();
  const before = store.getSnapshot().preferences;
  const creator =
    kind === 'creator'
      ? blockedCreatorSchema.parse(
          theme.creator
            ? {
                handle: theme.creator.handle,
                displayName: theme.creator.displayName,
              }
            : null,
        )
      : null;
  if (
    creator
      ? !before.blockedCreators.some(({ handle }) => handle === creator.handle) &&
        before.blockedCreators.length >= MAX_BLOCKED_CREATORS
      : !before.hiddenThemeIds.includes(theme.id) && before.hiddenThemeIds.length >= 500
  )
    throw new RangeError('Hidden content limit');
  const selection = before.widgetSelection;
  const clear =
    selection !== null &&
    (selection.id === theme.id || (creator !== null && selection.creatorHandle === creator.handle));
  if (clear) await clearWidget();
  await store.update((current) => ({
    ...(creator
      ? {
          blockedCreators: [
            creator,
            ...current.blockedCreators.filter(({ handle }) => handle !== creator.handle),
          ],
        }
      : { hiddenThemeIds: [...new Set([theme.id, ...current.hiddenThemeIds])] }),
    ...(clear ? { widgetSelection: null } : {}),
  }));
}
