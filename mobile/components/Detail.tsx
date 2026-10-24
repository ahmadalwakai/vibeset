import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { fetchTheme } from '../lib/api';
import type { ThemeDetailDTO } from '../lib/api';
import { PreferenceReadError } from '../lib/preferences';
import { NativeMediaError, saveWallpaper, shareWallpaper } from '../lib/media';
import { localizedName, formatNumber } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n';
import { serviceMessage } from './Catalog';
import { Button, Copy, Feedback, Loading, Panel, styles, useUi } from './Ui';

export function Detail({
  slug,
  favoriteIds,
  onFavorite,
  onApply,
}: {
  slug: string;
  favoriteIds: readonly string[];
  onFavorite: (id: string) => void;
  onApply: (theme: ThemeDetailDTO) => Promise<void>;
}): ReactElement {
  const { t, colors, locale, row } = useUi();
  const [theme, setTheme] = useState<ThemeDetailDTO | null>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<'save' | 'share' | 'widget' | null>(null);
  const [broken, setBroken] = useState(false);
  const active = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const performing = useRef(false);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void fetchTheme(slug, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setTheme(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure(serviceMessage(error));
      });
    return () => {
      active.current = false;
      controller.abort();
      operation.current?.abort();
    };
  }, [slug, retry]);
  const run = async (kind: 'save' | 'share' | 'widget'): Promise<void> => {
    if (!theme || performing.current) return;
    performing.current = true;
    setBusy(kind);
    const controller = new AbortController();
    operation.current = controller;
    try {
      if (kind === 'save') await saveWallpaper(theme, controller.signal);
      else if (kind === 'share') await shareWallpaper(theme, controller.signal);
      else await onApply(theme);
      if (active.current && !controller.signal.aborted && kind !== 'share')
        Alert.alert(t('done'), t(kind === 'save' ? 'wallpaperSaved' : 'widgetApplied'));
    } catch (error) {
      if (!active.current || controller.signal.aborted) return;
      let message: MessageKey = kind === 'widget' ? 'errorWidget' : 'errorMedia';
      if (error instanceof PreferenceReadError) message = 'readStorageWarning';
      if (error instanceof NativeMediaError) {
        if (error.code === 'PERMISSION_DENIED') message = 'errorPermission';
        else if (error.code === 'NO_WALLPAPER') message = 'errorNoWallpaper';
        else if (error.code === 'CONFIG') message = 'errorConfig';
        else if (error.code === 'NETWORK') message = 'errorNetwork';
      }
      Alert.alert(t(message));
    } finally {
      performing.current = false;
      if (operation.current === controller) operation.current = null;
      if (active.current) setBusy(null);
    }
  };
  if (!theme)
    return failure ? (
      <ScrollView contentContainerStyle={styles.page}>
        <Feedback
          message={t(failure)}
          onRetry={() => {
            setFailure(null);
            setRetry((value) => value + 1);
          }}
        />
      </ScrollView>
    ) : (
      <Loading />
    );
  const name = localizedName(locale, theme);
  const image = theme.previewHomeUrl ?? theme.thumbUrl;
  const description =
    locale === 'ar' && theme.descriptionAr ? theme.descriptionAr : theme.descriptionEn;
  const favorite = favoriteIds.includes(theme.id);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Copy heading accessibilityRole="header">
        {name}
      </Copy>
      {description ? <Copy style={{ color: colors.secondary }}>{description}</Copy> : null}
      <View
        style={{
          width: '76%',
          maxWidth: 320,
          alignSelf: 'center',
          aspectRatio: 1080 / 2340,
          borderRadius: 28,
          overflow: 'hidden',
          backgroundColor: theme.dominantColor ?? colors.muted,
          direction: 'ltr',
        }}
      >
        {image && !broken ? (
          <Image
            source={{ uri: image }}
            onError={() => setBroken(true)}
            accessibilityLabel={name}
            style={{ flex: 1 }}
            resizeMode="contain"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Copy
              style={{
                color: colors.ink,
                backgroundColor: colors.panel,
                padding: 20,
                borderRadius: 24,
              }}
            >
              ✦
            </Copy>
          </View>
        )}
      </View>
      <View style={{ flexDirection: row, justifyContent: 'space-around', gap: 12 }}>
        <Copy style={{ color: colors.secondary, fontSize: 13 }}>
          {t('downloads')} · {formatNumber(locale, theme.downloadCount)}
        </Copy>
        <Copy style={{ color: colors.secondary, fontSize: 13 }}>
          {t('favorites')} · {formatNumber(locale, theme.favoriteCount)}
        </Copy>
      </View>
      <Button
        secondary
        label={t(favorite ? 'removeFavorite' : 'saveFavorite')}
        onPress={() => onFavorite(theme.id)}
      />
      <Panel>
        <Copy heading style={{ fontSize: 22 }}>
          {t('wallpaper')}
        </Copy>
        <Button
          label={t('saveWallpaper')}
          onPress={() => void run('save')}
          disabled={busy !== null}
          busy={busy === 'save'}
        />
        <Button
          secondary
          label={t('shareWallpaper')}
          onPress={() => void run('share')}
          disabled={busy !== null}
          busy={busy === 'share'}
        />
      </Panel>
      <Panel>
        <Copy heading style={{ fontSize: 22 }}>
          {t('widgetsTab')}
        </Copy>
        <Copy>{t('widgetsDescription')}</Copy>
        <Button
          label={t('applyWidget')}
          onPress={() => void run('widget')}
          disabled={busy !== null}
          busy={busy === 'widget'}
        />
        <Copy style={{ fontSize: 13, color: colors.secondary }}>{t('widgetInstructions')}</Copy>
      </Panel>
    </ScrollView>
  );
}
