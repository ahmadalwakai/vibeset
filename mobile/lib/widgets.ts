import type { ThemeDetailDTO } from '../../lib/dto';
import {
  buildCalendarTimeline,
  calendarWidgetPropsSchema,
  emptyCalendarWidgetProps,
} from '../widgets/model';

let revision = 0;
function requireCurrent(current: number): void {
  if (current === revision) return;
  const error = new Error('A newer widget choice replaced this update');
  error.name = 'AbortError';
  throw error;
}

/** Native updates accept a bounded timeline; returning does not confirm widget placement or OS refresh. */
export async function applyThemeWidget(theme: ThemeDetailDTO, locale: 'en' | 'ar'): Promise<void> {
  const entries = buildCalendarTimeline(theme, locale);
  const current = ++revision;
  const { default: widget } = await import('../widgets/CalendarWidget');
  requireCurrent(current);
  widget.updateTimeline(entries);
}

export async function clearThemeWidget(): Promise<void> {
  const current = ++revision;
  const { default: widget } = await import('../widgets/CalendarWidget');
  requireCurrent(current);
  let locale: 'en' | 'ar' = 'en';
  try {
    const previous = await widget.getTimeline();
    const parsed = calendarWidgetPropsSchema.safeParse(previous[0]?.props);
    if (parsed.success) locale = parsed.data.locale;
  } catch {
    // An unreadable prior timeline must not prevent explicitly clearing the selection.
  }
  requireCurrent(current);
  widget.updateSnapshot(emptyCalendarWidgetProps(locale));
}

/** Ask the native provider to recompute dates after app resume/time-zone changes. */
export async function refreshThemeWidget(): Promise<void> {
  const current = revision;
  const { default: widget } = await import('../widgets/CalendarWidget');
  if (current === revision) widget.reload();
}
