import { z } from 'zod';
import type { ThemeDetailDTO } from '../../lib/dto';
import { Hex, themeSpecSchema } from '../../lib/render/spec';
import ar from '../messages/ar.json';
import en from '../messages/en.json';
import { initialCalendarWidgetProps } from './initial-props';

const localeSchema = z.enum(['en', 'ar']);
const themeInputSchema = z.object({
  id: z.uuid().transform((value) => value.toLowerCase()),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).nullable(),
  spec: themeSpecSchema,
});
const cellSchema = z.strictObject({
  label: z.string().max(2),
  today: z.boolean(),
  inMonth: z.boolean(),
});
export const calendarWidgetPropsSchema = z.strictObject({
  active: z.boolean(),
  themeId: z.uuid().nullable(),
  themeName: z.string().max(160),
  locale: localeSchema,
  surface: Hex,
  ink: Hex,
  accent: Hex,
  accentInk: Hex,
  radius: z.number().min(0).max(0.5),
  fontDesign: z.enum(['default', 'rounded', 'serif', 'monospaced']),
  monthLabel: z.string().max(100),
  weekdayLabel: z.string().max(100),
  dayLabel: z.string().max(2),
  dateLabel: z.string().max(160),
  weekdays: z.array(z.string().max(20)).length(7),
  cells: z.array(cellSchema).length(42),
  clockAnchor: z.number().int().finite(),
  clockEnd: z.number().int().finite(),
  emptyTitle: z.string().max(100),
  emptyDescription: z.string().max(160),
});
export type CalendarWidgetProps = z.infer<typeof calendarWidgetPropsSchema>;
export interface CalendarWidgetEntry {
  date: Date;
  props: CalendarWidgetProps;
}
export const MAX_WIDGET_TIMELINE_ENTRIES = 52;
export const WIDGET_TIMELINE_HOURS = 24;
const HALF_HOUR = 30 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function luminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
function contrast(first: string, second: string): number {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function readableInk(ink: string, surface: string): string {
  if (contrast(ink, surface) >= 4.5) return ink;
  return contrast('#000000', surface) >= contrast('#ffffff', surface) ? '#000000' : '#ffffff';
}
/** Matches the native calendar's highlighted-day foreground, including older saved selections. */
export function calendarAccentInk(ink: string, accent: string): string {
  return readableInk(Hex.parse(ink), Hex.parse(accent));
}
function validDate(now: Date): Date {
  return z
    .date()
    .refine((date) => date.getFullYear() >= 2000 && date.getFullYear() <= 2099)
    .parse(now);
}
export type CalendarDateFields = Pick<
  CalendarWidgetProps,
  | 'monthLabel'
  | 'weekdayLabel'
  | 'dayLabel'
  | 'dateLabel'
  | 'weekdays'
  | 'cells'
  | 'clockAnchor'
  | 'clockEnd'
>;
function clockFields(date: Date): Pick<CalendarWidgetProps, 'clockAnchor' | 'clockEnd'> {
  const clockAnchor =
    date.getTime() -
    (((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 +
      date.getMilliseconds());
  return { clockAnchor, clockEnd: clockAnchor + DAY };
}
export function buildCalendarDateFields(now: Date, locale: 'en' | 'ar'): CalendarDateFields {
  const date = validDate(now);
  const language =
    localeSchema.parse(locale) === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB-u-ca-gregory';
  const format = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(language, options).format(date);
  // Monday-first in both languages; Arabic rows are presented from their logical right edge.
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const dayFormatter = new Intl.DateTimeFormat(language, { day: 'numeric' });
  const weekdayFormatter = new Intl.DateTimeFormat(language, { weekday: 'narrow' });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    weekdayFormatter.format(new Date(2026, 0, 5 + index, 12)),
  );
  const cells = Array.from({ length: 42 }, (_, index) => {
    const cell = new Date(date.getFullYear(), date.getMonth(), 1 - mondayOffset + index, 12);
    return {
      label: dayFormatter.format(cell),
      inMonth: cell.getMonth() === date.getMonth(),
      today:
        cell.getFullYear() === date.getFullYear() &&
        cell.getMonth() === date.getMonth() &&
        cell.getDate() === date.getDate(),
    };
  });
  // Native timer text counts local wall-clock time without an app-process interval.
  return {
    monthLabel: format({ month: 'long', year: 'numeric' }),
    weekdayLabel: format({ weekday: 'long' }),
    dayLabel: dayFormatter.format(date),
    dateLabel: format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    weekdays,
    cells,
    ...clockFields(date),
  };
}

/** Only selected public theme tokens and bounded display data cross the widget boundary. */
export function buildCalendarWidgetProps(
  theme: ThemeDetailDTO,
  locale: 'en' | 'ar',
  now = new Date(),
): CalendarWidgetProps {
  const input = themeInputSchema.parse(theme);
  const language = localeSchema.parse(locale);
  const { widgets, palette, type } = input.spec;
  const surface = widgets.style === 'outline' ? palette.bg : widgets.surface;
  const copy = (language === 'ar' ? ar : en).widgets.native;
  return calendarWidgetPropsSchema.parse({
    active: true,
    themeId: input.id,
    themeName: language === 'ar' && input.nameAr ? input.nameAr : input.nameEn,
    locale: language,
    surface,
    ink: readableInk(widgets.ink, surface),
    accent: widgets.accent,
    accentInk: calendarAccentInk(widgets.ink, widgets.accent),
    radius: widgets.radius,
    // System designs remain readable before custom fonts are bundled into the extension.
    fontDesign:
      type.display === 'fraunces'
        ? 'serif'
        : type.display === 'jetbrains-mono'
          ? 'monospaced'
          : 'rounded',
    ...buildCalendarDateFields(now, language),
    emptyTitle: copy.emptyTitle,
    emptyDescription: copy.emptyDescription,
  });
}

/** A bounded next-day timeline; applying again refreshes it. OS delivery cadence is not guaranteed. */
export function buildCalendarTimeline(
  theme: ThemeDetailDTO,
  locale: 'en' | 'ar',
  now = new Date(),
): CalendarWidgetEntry[] {
  validDate(now);
  const initial = buildCalendarWidgetProps(theme, locale, now);
  const end = now.getTime() + WIDGET_TIMELINE_HOURS * 60 * 60 * 1000;
  const dates = new Set<number>([now.getTime()]);
  for (
    let time = Math.floor(now.getTime() / HALF_HOUR) * HALF_HOUR + HALF_HOUR;
    time <= end;
    time += HALF_HOUR
  )
    dates.add(time);
  // Include exact local midnight even for quarter-hour offsets and short DST days.
  for (let offset = 1; offset <= 2; offset += 1) {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime();
    if (midnight > now.getTime() && midnight <= end) dates.add(midnight);
  }
  const ordered = [...dates].sort((a, b) => a - b);
  if (ordered.length > MAX_WIDGET_TIMELINE_ENTRIES)
    throw new RangeError('Widget timeline exceeds its bound');
  const calendarCache = new Map<string, CalendarDateFields>();
  return ordered.map((time) => {
    const date = new Date(time);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const calendar = calendarCache.get(key) ?? buildCalendarDateFields(date, locale);
    calendarCache.set(key, calendar);
    return { date, props: { ...initial, ...calendar, ...clockFields(date) } };
  });
}

export function emptyCalendarWidgetProps(
  locale: 'en' | 'ar' = 'en',
  now = new Date(),
): CalendarWidgetProps {
  const language = localeSchema.parse(locale);
  return calendarWidgetPropsSchema.parse({
    ...initialCalendarWidgetProps(language),
    ...buildCalendarDateFields(now, language),
  });
}
