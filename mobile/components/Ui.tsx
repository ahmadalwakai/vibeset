import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TextProps, ViewStyle } from 'react-native';
import type { NativeLocale } from '../lib/preferences';
import { translate } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n';

export const palettes = {
  light: {
    bg: '#faf8fc',
    panel: '#ffffff',
    muted: '#f3f0f6',
    ink: '#16121d',
    secondary: '#665c76',
    border: '#e5e0eb',
    brand: '#9734b1',
    onBrand: '#ffffff',
    danger: '#aa2638',
  },
  dark: {
    bg: '#16121d',
    panel: '#231e2c',
    muted: '#373042',
    ink: '#faf8fc',
    secondary: '#cdc6d7',
    border: '#50475e',
    brand: '#cc70e2',
    onBrand: '#2d0d36',
    danger: '#ffb4bc',
  },
};
export type Colors = typeof palettes.light;
interface UiValue {
  locale: NativeLocale;
  colors: Colors;
}
export const UiContext = createContext<UiValue>({ locale: 'en', colors: palettes.light });
export function useUi(): UiValue & { t: (key: MessageKey) => string; row: 'row' | 'row-reverse' } {
  const value = useContext(UiContext);
  return {
    ...value,
    t: (key) => translate(value.locale, key),
    row: value.locale === 'ar' ? 'row-reverse' : 'row',
  };
}
export function Copy({
  style,
  heading,
  ...props
}: TextProps & { heading?: boolean }): ReactElement {
  const { colors, locale } = useUi();
  return (
    <Text
      {...props}
      style={[
        styles.copy,
        {
          color: colors.ink,
          writingDirection: locale === 'ar' ? 'rtl' : 'ltr',
          textAlign: locale === 'ar' ? 'right' : 'left',
          fontFamily: heading
            ? locale === 'ar'
              ? 'VibesetArabicDisplay'
              : 'VibesetDisplay'
            : 'VibesetBody',
        },
        heading && styles.heading,
        style,
      ]}
    />
  );
}
export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  secondary = false,
  accessibilityLabel,
  selected,
  style,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  accessibilityLabel?: string;
  selected?: boolean;
  style?: ViewStyle;
}): ReactElement {
  const { colors, row } = useUi();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy, selected }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          flexDirection: row,
          backgroundColor: secondary ? colors.muted : colors.brand,
          opacity: disabled || busy ? 0.65 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={secondary ? colors.ink : colors.onBrand} /> : null}
      <Copy
        style={{
          color: secondary ? colors.ink : colors.onBrand,
          textAlign: 'center',
          fontSize: 14,
        }}
      >
        {label}
      </Copy>
    </Pressable>
  );
}
export function Panel({ children }: { children: ReactNode }): ReactElement {
  const { colors } = useUi();
  return (
    <View style={[styles.panel, { backgroundColor: colors.panel, borderColor: colors.border }]}>
      {children}
    </View>
  );
}
export function Feedback({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): ReactElement {
  const { t } = useUi();
  return (
    <Panel>
      <Copy accessibilityRole="alert">{message}</Copy>
      {onRetry ? <Button secondary label={t('retry')} onPress={onRetry} /> : null}
    </Panel>
  );
}
export function Loading(): ReactElement {
  const { t, colors } = useUi();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('loading')} style={styles.loading}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Copy>{t('loading')}</Copy>
    </View>
  );
}
export const styles = StyleSheet.create({
  copy: { fontSize: 16, lineHeight: 25 },
  heading: { fontSize: 28, lineHeight: 38 },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  panel: { padding: 18, borderWidth: 1, borderRadius: 24, gap: 14 },
  loading: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  page: { padding: 20, gap: 20, paddingBottom: 32 },
});
