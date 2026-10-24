import type { ReactElement } from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { getNativeApiOrigin } from '../lib/api';
import type { NativePreferences, PreferencesPatch } from '../lib/preferences';
import { Button, Copy, Panel, styles, useUi } from './Ui';

export function Settings({
  preferences,
  onChange,
  onUnblock,
}: {
  preferences: NativePreferences;
  onChange: (patch: PreferencesPatch) => void;
  onUnblock: (handle: string) => void;
}): ReactElement {
  const { t, colors, locale, row } = useUi();
  const open = async (document: 'privacy' | 'terms' | 'copyright' | 'support'): Promise<void> => {
    try {
      const url =
        document === 'support'
          ? 'mailto:ahmadalwakai@gmx.com?subject=Vibeset%20iPhone%20support'
          : new URL(`${locale === 'ar' ? '/ar' : ''}/legal/${document}`, getNativeApiOrigin()).href;
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('errorLink'));
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Copy heading>{t('settings')}</Copy>
      <Panel>
        <Copy accessibilityRole="header">{t('language')}</Copy>
        <View style={{ flexDirection: row, gap: 10 }}>
          {(['en', 'ar'] as const).map((value) => (
            <Button
              key={value}
              label={t(value === 'en' ? 'english' : 'arabic')}
              secondary={preferences.locale !== value}
              selected={preferences.locale === value}
              onPress={() => onChange({ locale: value })}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </Panel>
      <Panel>
        <Copy accessibilityRole="header">{t('blockedCreators')}</Copy>
        <Copy style={{ color: colors.secondary }}>{t('blockedDescription')}</Copy>
        {preferences.blockedCreators.length ? (
          preferences.blockedCreators.map((creator) => (
            <View key={creator.handle} style={{ gap: 8 }}>
              <Copy>
                {creator.displayName} · @{creator.handle}
              </Copy>
              <Button
                secondary
                label={t('unblockCreator')}
                accessibilityLabel={`${t('unblockCreator')} · ${creator.displayName}`}
                onPress={() => onUnblock(creator.handle)}
              />
            </View>
          ))
        ) : (
          <Copy>{t('noBlockedCreators')}</Copy>
        )}
        {preferences.hiddenThemeIds.length ? (
          <Button
            secondary
            label={t('restoreHiddenThemes')}
            onPress={() =>
              Alert.alert(t('restoreHiddenThemes'), t('restoreHiddenDescription'), [
                { text: t('cancel'), style: 'cancel' },
                { text: t('restoreHiddenThemes'), onPress: () => onChange({ hiddenThemeIds: [] }) },
              ])
            }
          />
        ) : null}
      </Panel>
      <Panel>
        <Copy accessibilityRole="header">{t('appearance')}</Copy>
        <View style={{ gap: 8 }}>
          {(['system', 'light', 'dark'] as const).map((value) => (
            <Button
              key={value}
              label={t(value)}
              secondary={preferences.appearance !== value}
              selected={preferences.appearance === value}
              onPress={() => onChange({ appearance: value })}
            />
          ))}
        </View>
      </Panel>
      <Panel>
        {(['privacy', 'terms', 'copyright', 'support'] as const).map((value) => (
          <Button key={value} label={t(value)} secondary onPress={() => void open(value)} />
        ))}
        <Copy selectable style={{ color: colors.secondary, fontSize: 13 }}>
          {t('supportEmail')}
        </Copy>
      </Panel>
      <Copy style={{ color: colors.secondary, textAlign: 'center' }}>{t('about')}</Copy>
      <Copy style={{ color: colors.secondary, textAlign: 'center', fontSize: 12 }}>
        {t('version')}
      </Copy>
    </ScrollView>
  );
}
