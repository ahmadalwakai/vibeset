import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useReducer, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { FlatList, Image, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { fetchThemes, NativeServiceError } from '../lib/api';
import type { ThemeCardDTO, ThemeListQuery } from '../lib/api';
import { formatNumber, localizedName } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n';
import { Button, Copy, Feedback, Loading, Panel, styles, useUi } from './Ui';
import { thumbnailReducer } from './thumbnail-state';
import { visibleCreatorThemes } from '../lib/creator-blocks';
import type { BlockedCreator } from '../lib/creator-blocks';

export function serviceMessage(error: unknown): MessageKey {
  if (!(error instanceof NativeServiceError)) return 'errorNetwork';
  const messages: Record<NativeServiceError['code'], MessageKey> = {
    CONFIG: 'errorConfig',
    NETWORK: 'errorNetwork',
    NOT_FOUND: 'errorNotFound',
    INVALID_RESPONSE: 'errorResponse',
    HTTP: 'errorHttp',
  };
  return messages[error.code];
}
function Card({
  theme,
  favorite,
  onOpen,
  onFavorite,
}: {
  theme: ThemeCardDTO;
  favorite: boolean;
  onOpen: () => void;
  onFavorite: () => void;
}): ReactElement {
  const { colors, locale, row, t } = useUi();
  const [thumbnail, thumbnailEvent] = useReducer(thumbnailReducer, {
    url: theme.thumbUrl,
    failed: false,
  });
  if (thumbnail.url !== theme.thumbUrl) thumbnailEvent({ kind: 'source', url: theme.thumbUrl });
  const broken = thumbnail.url === theme.thumbUrl && thumbnail.failed;
  const name = localizedName(locale, theme);
  return (
    <View
      style={{
        flex: 1,
        maxWidth: '50%',
        backgroundColor: colors.panel,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={name}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <View
          style={{
            aspectRatio: 0.65,
            backgroundColor: theme.dominantColor ?? colors.muted,
            direction: 'ltr',
          }}
        >
          {theme.thumbUrl && !broken ? (
            <Image
              source={{ uri: theme.thumbUrl }}
              resizeMode="cover"
              accessibilityLabel={name}
              onError={() => {
                if (theme.thumbUrl) thumbnailEvent({ kind: 'failure', url: theme.thumbUrl });
              }}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Copy
                style={{
                  color: colors.ink,
                  backgroundColor: colors.panel,
                  padding: 10,
                  borderRadius: 16,
                }}
              >
                ✦
              </Copy>
            </View>
          )}
        </View>
      </Pressable>
      <View style={{ padding: 12, gap: 6 }}>
        <Copy numberOfLines={2} style={{ fontSize: 14, lineHeight: 22 }}>
          {name}
        </Copy>
        <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
          <Copy style={{ fontSize: 11, color: colors.secondary }}>
            {theme.isFeatured ? t('featured') : `${formatNumber(locale, theme.downloadCount)} ↓`}
          </Copy>
          <Pressable
            onPress={onFavorite}
            accessibilityRole="button"
            accessibilityLabel={t(favorite ? 'removeFavorite' : 'saveFavorite')}
            accessibilityState={{ selected: favorite }}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Copy style={{ fontSize: 27, color: colors.brand }}>{favorite ? '♥' : '♡'}</Copy>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
interface PageState {
  key: string;
  items: ThemeCardDTO[];
  cursor: string | null;
  error: MessageKey | null;
  more: boolean;
}
export function Catalog({
  saved,
  favoriteIds,
  blockedCreators,
  hiddenThemeIds,
  onFavorite,
  onOpen,
}: {
  saved: boolean;
  favoriteIds: readonly string[];
  blockedCreators: readonly BlockedCreator[];
  hiddenThemeIds: readonly string[];
  onFavorite: (id: string) => void;
  onOpen: (slug: string) => void;
}): ReactElement {
  const { t, colors, locale, row } = useUi();
  const { width } = useWindowDimensions();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<ThemeListQuery['sort']>('trending');
  const [cycle, setCycle] = useState(0);
  const [page, setPage] = useState<PageState>({
    key: '',
    items: [],
    cursor: null,
    error: null,
    more: false,
  });
  const sequence = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const pagination = useRef<AbortController | null>(null);
  const savedKey = saved ? favoriteIds.join(',') : '';
  const key = JSON.stringify([saved, savedKey, q, sort, cycle]);
  const current = page.key === key ? page : null;
  const visibleItems = visibleCreatorThemes(current?.items ?? [], blockedCreators, hiddenThemeIds);
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim().normalize('NFC')), 300);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    const id = ++sequence.current;
    const controller = new AbortController();
    const activeControllers = controllers.current;
    activeControllers.add(controller);
    const load = async (): Promise<void> => {
      try {
        let items: ThemeCardDTO[];
        let cursor: string | null = null;
        if (saved) {
          const ids = savedKey ? savedKey.split(',') : [];
          const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
            ids.slice(index * 100, (index + 1) * 100),
          );
          const results = await Promise.all(
            batches.map((batch) =>
              fetchThemes({ ids: batch, sort: 'trending', limit: 24 }, controller.signal),
            ),
          );
          const lookup = new Map(
            results.flatMap((result) => result.items).map((item) => [item.id, item]),
          );
          items = ids.flatMap((value) => {
            const item = lookup.get(value);
            return item ? [item] : [];
          });
        } else {
          const result = await fetchThemes(
            { q: q.length >= 2 ? q : undefined, sort, limit: 24 },
            controller.signal,
          );
          items = result.items;
          cursor = result.nextCursor;
        }
        if (!controller.signal.aborted && sequence.current === id)
          setPage({ key, items, cursor, error: null, more: false });
      } catch (error) {
        if (!controller.signal.aborted && sequence.current === id)
          setPage({ key, items: [], cursor: null, error: serviceMessage(error), more: false });
      } finally {
        activeControllers.delete(controller);
      }
    };
    void load();
    return () => {
      sequence.current += 1;
      for (const pending of activeControllers) pending.abort();
      activeControllers.clear();
    };
  }, [key, saved, savedKey, q, sort]);
  const more = async (): Promise<void> => {
    if (
      !current?.cursor ||
      current.more ||
      (pagination.current && !pagination.current.signal.aborted)
    )
      return;
    const id = sequence.current;
    const controller = new AbortController();
    pagination.current = controller;
    controllers.current.add(controller);
    setPage({ ...current, more: true, error: null });
    try {
      const result = await fetchThemes(
        { q: q.length >= 2 ? q : undefined, sort, cursor: current.cursor, limit: 24 },
        controller.signal,
      );
      if (!controller.signal.aborted && sequence.current === id)
        setPage((previous) => {
          if (previous.key !== key) return previous;
          const seen = new Set(previous.items.map((item) => item.id));
          return {
            ...previous,
            items: [...previous.items, ...result.items.filter((item) => !seen.has(item.id))],
            cursor: result.nextCursor,
            more: false,
          };
        });
    } catch (error) {
      if (!controller.signal.aborted && sequence.current === id)
        setPage((previous) =>
          previous.key === key
            ? { ...previous, more: false, error: serviceMessage(error) }
            : previous,
        );
    } finally {
      controllers.current.delete(controller);
      if (pagination.current === controller) pagination.current = null;
    }
  };
  const header = (
    <View style={{ gap: 20, marginBottom: 20 }}>
      {saved ? (
        <>
          <Copy heading>{t('savedTitle')}</Copy>
          <Copy style={{ color: colors.secondary }}>{t('savedDescription')}</Copy>
        </>
      ) : (
        <>
          <LinearGradient
            colors={['#491b56', '#9734b1', '#94341f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 24, borderRadius: 28, gap: 12 }}
          >
            <Copy style={{ color: '#ffffff', fontSize: 28, lineHeight: 39 }} heading>
              {t('heroTitle')}
            </Copy>
            <Copy style={{ color: '#ffffff', fontSize: 14 }}>{t('heroDescription')}</Copy>
          </LinearGradient>
          <View style={{ gap: 8 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              maxLength={64}
              placeholder={t('search')}
              placeholderTextColor={colors.secondary}
              accessibilityLabel={t('search')}
              returnKeyType="search"
              autoCorrect={false}
              style={{
                minHeight: 52,
                paddingHorizontal: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panel,
                color: colors.ink,
                borderRadius: 26,
                fontFamily: 'VibesetBody',
                textAlign: locale === 'ar' ? 'right' : 'left',
                writingDirection: locale === 'ar' ? 'rtl' : 'ltr',
              }}
            />
            {text.length === 1 ? (
              <Copy style={{ fontSize: 12, color: colors.secondary }}>{t('searchHint')}</Copy>
            ) : null}
          </View>
          <View style={{ flexDirection: row, gap: 8 }}>
            {(['trending', 'new', 'popular'] as const).map((value) => (
              <Button
                key={value}
                label={t(value)}
                secondary={sort !== value}
                selected={sort === value}
                onPress={() => setSort(value)}
                style={{ flex: 1, paddingHorizontal: 8 }}
              />
            ))}
          </View>
        </>
      )}
      <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
        <Copy style={{ color: colors.secondary, fontSize: 13 }}>
          {t('catalogueCount')} · {formatNumber(locale, visibleItems.length)}
        </Copy>
        <Button secondary label={t('refresh')} onPress={() => setCycle((value) => value + 1)} />
      </View>
      {current && saved && current.items.length < favoriteIds.length ? (
        <Copy style={{ color: colors.secondary }}>{t('savedUnavailable')}</Copy>
      ) : null}
    </View>
  );
  return (
    <FlatList
      key={saved ? 'saved' : 'explore'}
      data={visibleItems}
      numColumns={2}
      keyExtractor={(item) => item.id}
      columnWrapperStyle={{ gap: 12, marginBottom: 14, flexDirection: row }}
      contentContainerStyle={[styles.page, { alignSelf: 'center', width: Math.min(width, 780) }]}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <Card
          theme={item}
          favorite={favoriteIds.includes(item.id)}
          onOpen={() => onOpen(item.slug)}
          onFavorite={() => onFavorite(item.id)}
        />
      )}
      ListEmptyComponent={
        !current ? (
          <Loading />
        ) : current.error ? (
          <Feedback message={t(current.error)} onRetry={() => setCycle((value) => value + 1)} />
        ) : (
          <Panel>
            <Copy heading>{t(saved ? 'saved' : 'emptyTitle')}</Copy>
            <Copy>
              {t(current.items.length ? 'hiddenPage' : saved ? 'savedEmpty' : 'emptyDescription')}
            </Copy>
          </Panel>
        )
      }
      ListFooterComponent={
        current && (current.items.length > 0 || current.cursor) ? (
          <View style={{ gap: 16, paddingTop: 8 }}>
            {current.error ? (
              <Feedback message={t(current.error)} onRetry={() => void more()} />
            ) : null}
            {current.cursor ? (
              <Button label={t('loadMore')} busy={current.more} onPress={() => void more()} />
            ) : null}
          </View>
        ) : undefined
      }
    />
  );
}
