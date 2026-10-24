import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import type { WidgetSelection } from '../lib/preferences';
import { PreferenceReadError } from '../lib/preferences';
import { localizedName } from '../lib/i18n';
import { buildCalendarDateFields, calendarAccentInk } from '../widgets/model';
import { Button, Copy, Panel, styles, useUi } from './Ui';

export function CalendarPreview({
  selection,
}: {
  selection: WidgetSelection & { accentInk?: string };
}): ReactElement {
  const { locale, t } = useUi();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const appliedLocale = selection.appliedLocale === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
  const fields = buildCalendarDateFields(now, selection.appliedLocale);
  const accentInk = calendarAccentInk(selection.accentInk ?? selection.ink, selection.accent);
  return (
    <View
      accessibilityLabel={t('widgetPreview')}
      style={{
        backgroundColor: selection.surface,
        borderRadius: 28,
        padding: 24,
        gap: 18,
        direction: 'ltr',
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <View
        style={{
          flexDirection: selection.appliedLocale === 'ar' ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Copy style={{ color: selection.ink, fontSize: 28, lineHeight: 36 }}>
          {fields.dayLabel}
        </Copy>
        <Copy style={{ color: selection.ink, fontSize: 16 }}>{fields.monthLabel}</Copy>
      </View>
      <Copy style={{ color: selection.ink, fontSize: 30, lineHeight: 40 }}>
        {new Intl.DateTimeFormat(appliedLocale, { hour: '2-digit', minute: '2-digit' }).format(now)}
      </Copy>
      <View style={{ flexDirection: selection.appliedLocale === 'ar' ? 'row-reverse' : 'row' }}>
        {fields.weekdays.map((day, index) => (
          <View key={index} style={{ width: '14.2857%', alignItems: 'center' }}>
            <Copy style={{ color: selection.ink, fontSize: 11 }}>{day}</Copy>
          </View>
        ))}
      </View>
      <View
        style={{
          flexDirection: selection.appliedLocale === 'ar' ? 'row-reverse' : 'row',
          flexWrap: 'wrap',
        }}
      >
        {fields.cells.map((day, index) => {
          return (
            <View
              key={index}
              style={{
                width: '14.2857%',
                minHeight: 32,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: day.today ? selection.accent : 'transparent',
                borderRadius: 8,
              }}
            >
              <Copy
                style={{
                  color: day.today ? accentInk : selection.ink,
                  fontSize: 12,
                  fontWeight: day.today ? '700' : '400',
                }}
              >
                {day.inMonth ? day.label : ''}
              </Copy>
            </View>
          );
        })}
      </View>
      <Copy
        style={{
          color: selection.ink,
          fontSize: 11,
          textAlign: locale === 'ar' ? 'right' : 'left',
        }}
      >
        {localizedName(selection.appliedLocale, selection)}
      </Copy>
    </View>
  );
}
export function Widgets({
  selection,
  onChoose,
  onClear,
  refreshError,
  onRefresh,
}: {
  selection: WidgetSelection | null;
  onChoose: () => void;
  onClear: () => Promise<void>;
  refreshError: boolean;
  onRefresh: () => void;
}): ReactElement {
  const { t, colors, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const performing = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const clear = async (): Promise<void> => {
    if (performing.current) return;
    performing.current = true;
    setBusy(true);
    try {
      await onClear();
      if (active.current) Alert.alert(t('widgetCleared'));
    } catch (error) {
      if (active.current)
        Alert.alert(t(error instanceof PreferenceReadError ? 'readStorageWarning' : 'errorWidget'));
    } finally {
      performing.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Copy heading>{t('widgetsTitle')}</Copy>
      <Copy style={{ color: colors.secondary }}>{t('widgetsDescription')}</Copy>
      {refreshError ? (
        <Panel>
          <Copy accessibilityRole="alert">{t('errorWidget')}</Copy>
          <Button secondary label={t('retry')} onPress={onRefresh} />
        </Panel>
      ) : null}
      {selection ? (
        <>
          <CalendarPreview selection={selection} />
          <Copy style={{ color: colors.secondary, fontSize: 12 }}>{t('previewOnly')}</Copy>
          <Panel>
            <Copy>
              {t('selectedTheme')} · {localizedName(locale, selection)}
            </Copy>
            <Copy>{t('widgetLanguageNote')}</Copy>
            <Button secondary label={t('clearWidget')} onPress={() => void clear()} busy={busy} />
          </Panel>
        </>
      ) : (
        <Panel>
          <Copy>{t('widgetsEmpty')}</Copy>
        </Panel>
      )}
      <Button label={t('chooseTheme')} onPress={onChoose} />
      <Copy style={{ color: colors.secondary }}>{t('widgetInstructions')}</Copy>
    </ScrollView>
  );
}
