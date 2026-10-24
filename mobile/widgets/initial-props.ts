// Named JSON imports avoid Babel runtime interop helpers, which the registry also stubs.
import { widgets as arWidgets } from '../messages/ar.json';
import { widgets as enWidgets } from '../messages/en.json';
import type { CalendarWidgetProps } from './model';

/** Expo's layout registry stubs package imports; keep runtime validators in the app model. */
export function initialCalendarWidgetProps(
  locale: CalendarWidgetProps['locale'] = 'en',
): CalendarWidgetProps {
  const copy = (locale === 'ar' ? arWidgets : enWidgets).native;
  return {
    active: false,
    themeId: null,
    themeName: '',
    locale,
    surface: '#f8f5fb',
    ink: '#241b2f',
    accent: '#b44bd0',
    accentInk: '#ffffff',
    radius: 0.25,
    fontDesign: 'rounded',
    // The inactive layout renders instructions only, so no build-time date is captured.
    monthLabel: '',
    weekdayLabel: '',
    dayLabel: '',
    dateLabel: '',
    weekdays: Array.from({ length: 7 }, () => ''),
    cells: Array.from({ length: 42 }, () => ({ label: '', today: false, inMonth: false })),
    clockAnchor: 0,
    clockEnd: 1,
    emptyTitle: copy.emptyTitle,
    emptyDescription: copy.emptyDescription,
  };
}
