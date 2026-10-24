import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { Alert, AppState, Image, Pressable, StatusBar, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Catalog } from './components/Catalog';
import { Detail } from './components/Detail';
import { Settings } from './components/Settings';
import { Widgets } from './components/Widgets';
import { Button, Copy, Feedback, Loading, palettes, UiContext } from './components/Ui';
import { createPreferencesStore, MAX_FAVORITES, PreferenceReadError } from './lib/preferences';
import type { PreferencesPatch } from './lib/preferences';
import type { ThemeDetailDTO } from './lib/api';
import { translate } from './lib/i18n';
import { applyThemeWidget, clearThemeWidget, refreshThemeWidget } from './lib/widgets';
import { buildCalendarWidgetProps } from './widgets/model';
import { hideContentOnDevice } from './lib/content-safety';
import { isThemeHidden } from './lib/creator-blocks';

type Tab = 'explore' | 'saved' | 'widgets' | 'settings';
const tabs = [
  { id: 'explore', glyph: '◈', label: 'explore' },
  { id: 'saved', glyph: '♡', label: 'saved' },
  { id: 'widgets', glyph: '▦', label: 'widgetsTab' },
  { id: 'settings', glyph: '☷', label: 'settings' },
] as const;

export default function NativeApp(): ReactElement {
  const [store] = useState(() => createPreferencesStore(AsyncStorage));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { preferences } = snapshot;
  const system = useColorScheme();
  const mode = preferences.appearance === 'system' ? (system ?? 'light') : preferences.appearance;
  const colors = palettes[mode];
  const locale = preferences.locale;
  const t = (key: Parameters<typeof translate>[1]): string => translate(locale, key);
  const row = locale === 'ar' ? 'row-reverse' : 'row';
  const [tab, setTab] = useState<Tab>('explore');
  const [slug, setSlug] = useState<string | null>(null);
  const widgetQueue = useRef(Promise.resolve());
  const refreshFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const [widgetRefreshError, setWidgetRefreshError] = useState(false);
  const selectionIdentity = preferences.widgetSelection
    ? `${preferences.widgetSelection.id}:${preferences.widgetSelection.appliedLocale}`
    : null;
  const refreshWidget = useCallback((): void => {
    if (refreshFlight.current) return;
    const job = widgetQueue.current.catch(() => {}).then(() => refreshThemeWidget());
    widgetQueue.current = job;
    const handled = job.then(
      () => {
        if (mounted.current) setWidgetRefreshError(false);
      },
      () => {
        if (mounted.current) setWidgetRefreshError(true);
      },
    );
    refreshFlight.current = handled;
    void handled.finally(() => {
      if (refreshFlight.current === handled) refreshFlight.current = null;
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!selectionIdentity) return;
    refreshWidget();
    const subscription = AppState.addEventListener('change', (value) => {
      if (value === 'active') refreshWidget();
    });
    return () => subscription.remove();
  }, [selectionIdentity, refreshWidget]);
  useEffect(() => {
    void store.hydrate();
  }, [store]);
  const update = (patch: PreferencesPatch): void => {
    void store
      .update(patch)
      .catch((error: unknown) =>
        Alert.alert(
          t(error instanceof PreferenceReadError ? 'readStorageWarning' : 'storageWarning'),
        ),
      );
  };
  const favorite = (id: string): void => {
    void store
      .update((current) => {
        const included = current.favoriteIds.includes(id);
        if (!included && current.favoriteIds.length >= MAX_FAVORITES)
          throw new RangeError('Favorite limit');
        return {
          favoriteIds: included
            ? current.favoriteIds.filter((value) => value !== id)
            : [id, ...current.favoriteIds],
        };
      })
      .catch((error: unknown) =>
        Alert.alert(
          t(
            error instanceof PreferenceReadError
              ? 'readStorageWarning'
              : error instanceof RangeError
                ? 'favoriteLimit'
                : 'storageWarning',
          ),
        ),
      );
  };
  const mutateWidget = (job: () => Promise<void>): Promise<void> => {
    const next = widgetQueue.current.catch(() => {}).then(job);
    widgetQueue.current = next;
    return next;
  };
  const apply = (theme: ThemeDetailDTO): Promise<void> =>
    mutateWidget(async () => {
      await store.requireKnownBaseline();
      const current = store.getSnapshot().preferences;
      if (isThemeHidden(theme, current.blockedCreators, current.hiddenThemeIds))
        throw new Error('Hidden content cannot be applied');
      await applyThemeWidget(theme, locale);
      const props = buildCalendarWidgetProps(theme, locale);
      await store.update({
        widgetSelection: {
          id: theme.id,
          slug: theme.slug,
          nameEn: theme.nameEn,
          nameAr: theme.nameAr,
          surface: props.surface,
          ink: props.ink,
          accent: props.accent,
          appliedLocale: locale,
          creatorHandle: theme.creator?.handle ?? null,
        },
      });
      if (mounted.current) setWidgetRefreshError(false);
    });
  const clear = (): Promise<void> =>
    mutateWidget(async () => {
      await store.requireKnownBaseline();
      await clearThemeWidget();
      await store.update({ widgetSelection: null });
      if (mounted.current) setWidgetRefreshError(false);
    });
  const hide = (theme: ThemeDetailDTO, kind: 'theme' | 'creator'): Promise<void> =>
    mutateWidget(async () => {
      await hideContentOnDevice(store, theme, kind, clearThemeWidget);
      if (mounted.current) {
        setSlug((current) => (current === theme.slug ? null : current));
        setWidgetRefreshError(false);
      }
    });
  const unblock = (handle: string): void => {
    void store
      .update((current) => ({
        blockedCreators: current.blockedCreators.filter((creator) => creator.handle !== handle),
      }))
      .catch((error: unknown) =>
        Alert.alert(
          t(error instanceof PreferenceReadError ? 'readStorageWarning' : 'storageWarning'),
        ),
      );
  };
  const navigate = (value: Tab): void => {
    setSlug(null);
    setTab(value);
  };
  return (
    <UiContext value={{ locale, colors }}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg, direction: 'ltr' }}
        edges={['top', 'bottom']}
      >
        <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
        <View
          style={{
            minHeight: 64,
            paddingHorizontal: 20,
            paddingVertical: 8,
            flexDirection: row,
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
            <Image
              source={require('./assets/app-icon.png')}
              style={{ width: 36, height: 36, borderRadius: 10 }}
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <Copy style={{ fontFamily: 'VibesetDisplay', fontSize: 25 }}>vibeset</Copy>
          </View>
          {slug ? (
            <Button secondary label={t('back')} onPress={() => setSlug(null)} />
          ) : (
            <LinearGradient
              colors={['#9734b1', '#94341f']}
              style={{ width: 30, height: 4, borderRadius: 4 }}
            />
          )}
        </View>
        {snapshot.issue ? (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              gap: 8,
              borderBottomWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.panel,
            }}
          >
            <Copy accessibilityRole="alert" style={{ fontSize: 12, lineHeight: 18 }}>
              {t(
                snapshot.issue === 'READ_FAILED'
                  ? 'readStorageWarning'
                  : snapshot.issue === 'INVALID_STORAGE'
                    ? 'invalidStorage'
                    : 'storageWarning',
              )}
            </Copy>
            <Button
              secondary
              label={t(
                snapshot.saving
                  ? 'saving'
                  : snapshot.issue === 'READ_FAILED'
                    ? 'retryReadStorage'
                    : 'retryStorage',
              )}
              busy={snapshot.saving}
              onPress={() => void store.retryPersistence()}
            />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          {snapshot.loading ? (
            <Loading />
          ) : snapshot.issue === 'READ_FAILED' ? (
            <Feedback
              message={t('readStorageWarning')}
              onRetry={() => void store.retryPersistence()}
            />
          ) : (
            <>
              <View
                style={slug ? { display: 'none' } : { flex: 1 }}
                accessibilityElementsHidden={slug !== null}
                importantForAccessibility={slug ? 'no-hide-descendants' : 'auto'}
              >
                {tab === 'explore' || tab === 'saved' ? (
                  <Catalog
                    key={tab}
                    saved={tab === 'saved'}
                    favoriteIds={preferences.favoriteIds}
                    blockedCreators={preferences.blockedCreators}
                    hiddenThemeIds={preferences.hiddenThemeIds}
                    onFavorite={favorite}
                    onOpen={setSlug}
                  />
                ) : tab === 'widgets' ? (
                  <Widgets
                    selection={preferences.widgetSelection}
                    onChoose={() => navigate('explore')}
                    onClear={clear}
                    refreshError={widgetRefreshError}
                    onRefresh={refreshWidget}
                  />
                ) : (
                  <Settings preferences={preferences} onChange={update} onUnblock={unblock} />
                )}
              </View>
              {slug ? (
                <Detail
                  key={slug}
                  slug={slug}
                  favoriteIds={preferences.favoriteIds}
                  onFavorite={favorite}
                  onApply={apply}
                  blockedCreators={preferences.blockedCreators}
                  hiddenThemeIds={preferences.hiddenThemeIds}
                  onHide={hide}
                />
              ) : null}
            </>
          )}
        </View>
        <View
          style={{
            flexDirection: row,
            paddingHorizontal: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
          }}
        >
          {tabs.map((item) => {
            const selected = tab === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityLabel={t(item.label)}
                accessibilityState={{ selected }}
                onPress={() => navigate(item.id)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 64,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  borderRadius: 20,
                  backgroundColor: selected ? colors.muted : 'transparent',
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Copy
                  style={{
                    color: selected ? colors.brand : colors.secondary,
                    fontSize: 23,
                    lineHeight: 27,
                  }}
                >
                  {item.glyph}
                </Copy>
                <Copy
                  style={{
                    color: selected ? colors.ink : colors.secondary,
                    fontSize: 11,
                    lineHeight: 18,
                  }}
                >
                  {t(item.label)}
                </Copy>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </UiContext>
  );
}
