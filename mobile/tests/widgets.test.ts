import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDangerousMod } from 'expo/config-plugins';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecipe } from '../../content/aesthetics';
import { getPalette } from '../../content/palettes';
import type { ThemeDetailDTO } from '../../lib/dto';
import { buildSpec } from '../../lib/render/build-spec';
import { createRng } from '../../lib/render/prng';
import { applyThemeWidget, clearThemeWidget, refreshThemeWidget } from '../lib/widgets';
import withCalendarProvider, {
  installCalendarProvider,
  patchCalendarWidgetSource,
} from '../widget-plugin';
import {
  MAX_WIDGET_TIMELINE_ENTRIES,
  WIDGET_TIMELINE_HOURS,
  buildCalendarTimeline,
  buildCalendarWidgetProps,
  calendarWidgetPropsSchema,
  emptyCalendarWidgetProps,
} from '../widgets/model';

const native = vi.hoisted(() => ({
  updateTimeline: vi.fn(),
  updateSnapshot: vi.fn(),
  getTimeline: vi.fn(),
  reload: vi.fn(),
}));
vi.mock('../widgets/CalendarWidget', () => ({ default: native }));

function theme(): ThemeDetailDTO {
  const recipe = getRecipe('y2k');
  const palette = getPalette('midnight-y2k');
  if (!recipe || !palette) throw new Error('Missing real curated renderer fixture');
  return {
    id: 'dc38ceea-2493-43ae-a369-e09026b56919',
    slug: 'calendar-test',
    nameEn: 'Midnight Y2K',
    nameAr: 'منتصف الليل',
    spec: buildSpec(recipe, palette, createRng(20261024)),
    tags: [],
    thumbUrl: null,
    dominantColor: null,
    isFeatured: false,
    downloadCount: 0,
    favoriteCount: 0,
    creator: null,
    publishedAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    descriptionEn: null,
    descriptionAr: null,
    previewHomeUrl: null,
    previewLockUrl: null,
    ogUrl: null,
    wallpapers: [],
    remixOf: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  native.getTimeline.mockResolvedValue([]);
});

describe('native calendar data from real theme tokens', () => {
  it('retains selected identity and widget styling without copying API/photo/account data', () => {
    const source = theme();
    source.spec.widgets.style = 'solid';
    source.spec.widgets.surface = '#121212';
    source.spec.widgets.ink = '#ffffff';
    source.spec.widgets.accent = '#b44bd0';
    source.spec.widgets.radius = 0.3;
    const original = structuredClone(source);
    const props = buildCalendarWidgetProps(source, 'en', new Date(2026, 9, 24, 9, 41));
    expect(props).toMatchObject({
      active: true,
      themeId: source.id,
      themeName: source.nameEn,
      surface: '#121212',
      ink: '#ffffff',
      accent: '#b44bd0',
      radius: 0.3,
    });
    expect(props).not.toHaveProperty('spec');
    expect(props).not.toHaveProperty('wallpapers');
    expect(props).not.toHaveProperty('creator');
    expect(source).toEqual(original);
    expect(calendarWidgetPropsSchema.safeParse(props).success).toBe(true);
  });

  it('uses the opaque palette background for outline styles and fixes unreadable ink', () => {
    const source = theme();
    source.spec.widgets.style = 'outline';
    source.spec.palette.bg = '#ffffff';
    source.spec.widgets.surface = '#123456';
    source.spec.widgets.ink = '#ffffff';
    source.spec.widgets.accent = '#ffffff';
    expect(buildCalendarWidgetProps(source, 'en')).toMatchObject({
      surface: '#ffffff',
      ink: '#000000',
      accentInk: '#000000',
    });
  });

  it('localizes Arabic names and Gregorian date labels while keeping calendar digits Latin', () => {
    const source = theme();
    const date = new Date(2026, 9, 24, 9, 41);
    const english = buildCalendarWidgetProps(source, 'en', date);
    const arabic = buildCalendarWidgetProps(source, 'ar', date);
    expect(arabic.themeName).toBe(source.nameAr);
    expect(arabic.monthLabel).toMatch(/[\u0600-\u06ff]/);
    expect(arabic.monthLabel).not.toBe(english.monthLabel);
    expect(arabic.dayLabel).toBe('24');
    expect(arabic.cells.map((cell) => cell.label).join('')).not.toMatch(/[\u0660-\u0669]/);
    source.nameAr = '  ';
    expect(buildCalendarWidgetProps(source, 'ar', date).themeName).toBe(source.nameEn);
  });

  it('builds a Monday-first six-week calendar through leap February and month boundaries', () => {
    const props = buildCalendarWidgetProps(theme(), 'en', new Date(2028, 1, 29, 12));
    expect(props.cells).toHaveLength(42);
    expect(props.weekdays).toHaveLength(7);
    expect(props.cells.filter((cell) => cell.inMonth)).toHaveLength(29);
    expect(props.cells.filter((cell) => cell.today)).toEqual([
      { label: '29', today: true, inMonth: true },
    ]);
    expect(props.cells[0]).toEqual({ label: '31', today: false, inMonth: false });
    expect(props.cells[1]).toEqual({ label: '1', today: false, inMonth: true });
  });

  it('keeps identical logical calendar cell order for English and Arabic native direction', () => {
    const date = new Date(2028, 1, 29, 12);
    const english = buildCalendarWidgetProps(theme(), 'en', date);
    const arabic = buildCalendarWidgetProps(theme(), 'ar', date);
    expect(arabic.cells).toEqual(english.cells);
    expect(arabic.cells.findIndex((cell) => cell.today)).toBe(29);
    expect(arabic.weekdays).toHaveLength(7);
  });

  it('anchors the native count-up clock to local wall time including seconds', () => {
    const date = new Date(2026, 9, 24, 9, 41, 23, 456);
    const props = buildCalendarWidgetProps(theme(), 'en', date);
    expect(date.getTime() - props.clockAnchor).toBe((9 * 3600 + 41 * 60 + 23) * 1000 + 456);
    expect(props.clockEnd - props.clockAnchor).toBe(86_400_000);
  });

  it('rejects malformed theme tokens and invalid dates before passing data to native code', () => {
    const source = theme();
    source.spec.widgets.surface = 'url(https://example.invalid/image)';
    expect(() => buildCalendarWidgetProps(source, 'en')).toThrow();
    expect(() => buildCalendarWidgetProps(theme(), 'en', new Date('invalid'))).toThrow();
    expect(() => buildCalendarWidgetProps(theme(), 'en', new Date(1999, 1, 1))).toThrow();
  });

  it('clears selected identity into localized empty instructions rather than a demo theme', () => {
    const props = emptyCalendarWidgetProps('ar', new Date(2026, 9, 24));
    expect(props).toMatchObject({ active: false, themeId: null, themeName: '', locale: 'ar' });
    expect(props.emptyTitle).toMatch(/[\u0600-\u06ff]/);
    expect(props.emptyDescription).toContain('Vibeset');
  });
});

describe('bounded next-day native timeline', () => {
  it.each([
    new Date(2026, 9, 24, 23, 59, 59),
    new Date(2026, 11, 31, 23, 50),
    new Date(2028, 1, 28, 23, 45),
  ])('covers exact local midnight and orders unique future entries from %s', (now) => {
    const entries = buildCalendarTimeline(theme(), 'en', now);
    const times = entries.map((entry) => entry.date.getTime());
    expect(times[0]).toBe(now.getTime());
    expect(entries.length).toBeLessThanOrEqual(MAX_WIDGET_TIMELINE_ENTRIES);
    expect(times).toEqual([...new Set(times)].sort((a, b) => a - b));
    expect(
      times.every(
        (time) =>
          time >= now.getTime() && time <= now.getTime() + WIDGET_TIMELINE_HOURS * 3_600_000,
      ),
    ).toBe(true);
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const afterMidnight = entries.find((entry) => entry.date.getTime() === midnight.getTime());
    expect(afterMidnight?.props.dayLabel).toBe(String(midnight.getDate()));
    expect(afterMidnight?.props.cells.filter((cell) => cell.today)).toHaveLength(1);
    expect(entries.every((entry) => calendarWidgetPropsSchema.safeParse(entry.props).success)).toBe(
      true,
    );
    expect(JSON.stringify(entries).length).toBeLessThan(250_000);
  });

  it.each([
    ['Europe/London', '2026-03-29T00:45:00.000Z', '2026-03-29T01:00:00.000Z', 2],
    ['Europe/London', '2026-10-25T00:45:00.000Z', '2026-10-25T01:00:00.000Z', 1],
  ])('re-anchors the native timer across DST in %s at %s', (zone, initial, transition, hour) => {
    vi.stubEnv('TZ', zone);
    const entries = buildCalendarTimeline(theme(), 'en', new Date(initial));
    const entry = entries.find((item) => item.date.getTime() === Date.parse(transition));
    expect(entry).toBeDefined();
    expect(entry && (entry.date.getTime() - entry.props.clockAnchor) / 3_600_000).toBe(hour);
  });

  it('includes exact local midnight in a quarter-hour zone without changing Gregorian dates', () => {
    vi.stubEnv('TZ', 'Asia/Kathmandu');
    const entries = buildCalendarTimeline(theme(), 'ar', new Date('2026-12-31T17:55:00.000Z'));
    const midnight = entries.find(
      (item) => item.date.getTime() === Date.parse('2026-12-31T18:15:00.000Z'),
    );
    expect(midnight?.props.dayLabel).toBe('1');
    expect(midnight?.props.monthLabel).toContain('2027');
    expect(midnight && midnight.date.getTime() - midnight.props.clockAnchor).toBe(0);
  });
});

describe('native widget update boundary', () => {
  it('sends validated real-theme timeline props to the widget', async () => {
    const source = theme();
    await applyThemeWidget(source, 'ar');
    expect(native.updateTimeline).toHaveBeenCalledOnce();
    const entries: unknown = native.updateTimeline.mock.calls[0]?.[0];
    expect(Array.isArray(entries)).toBe(true);
    expect(native.updateSnapshot).not.toHaveBeenCalled();
  });

  it('rejects invalid data before issuing a native update', async () => {
    const source = theme();
    source.id = 'not-a-theme-id';
    await expect(applyThemeWidget(source, 'en')).rejects.toThrow();
    expect(native.updateTimeline).not.toHaveBeenCalled();
  });

  it('clears using the prior widget locale, and still clears if its old timeline is unreadable', async () => {
    native.getTimeline.mockResolvedValueOnce([{ props: buildCalendarWidgetProps(theme(), 'ar') }]);
    await clearThemeWidget();
    expect(native.updateSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: false, themeId: null, locale: 'ar' }),
    );
    native.getTimeline.mockRejectedValueOnce(new Error('Unavailable old timeline'));
    await clearThemeWidget();
    expect(native.updateSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: false, themeId: null }),
    );
  });

  it('prevents a slow earlier clear from erasing a newer applied theme', async () => {
    let resolve: ((value: unknown[]) => void) | undefined;
    const reading = new Promise<unknown[]>((done) => {
      resolve = done;
    });
    native.getTimeline.mockReturnValueOnce(reading);
    const clearing = clearThemeWidget();
    await vi.waitFor(() => expect(native.getTimeline).toHaveBeenCalledOnce());
    await applyThemeWidget(theme(), 'en');
    resolve?.([]);
    await expect(clearing).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.updateTimeline).toHaveBeenCalledOnce();
    expect(native.updateSnapshot).not.toHaveBeenCalled();
  });

  it('requests native date regeneration on resume without replacing the selected props', async () => {
    await refreshThemeWidget();
    expect(native.reload).toHaveBeenCalledOnce();
    expect(native.updateSnapshot).not.toHaveBeenCalled();
    expect(native.updateTimeline).not.toHaveBeenCalled();
    expect(native.getTimeline).not.toHaveBeenCalled();
  });
});

const generatedWidget = `import WidgetKit
import SwiftUI
internal import ExpoWidgets
struct VibesetCalendar: Widget {
  let name: String = "VibesetCalendar"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Vibeset Calendar")
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}`;
const temporaryRoots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('native automatic-calendar provider installation', () => {
  async function project(): Promise<{ ios: string; target: string; root: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vibeset-widget-'));
    temporaryRoots.push(root);
    const ios = path.join(root, 'ios');
    const target = path.join(ios, 'ExpoWidgetsTarget', 'VibesetCalendar.swift');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, generatedWidget);
    return { ios, target, root };
  }
  const mobileRoot = fileURLToPath(new URL('../', import.meta.url));

  it('patches only the existing generated calendar target, preserving its families and metadata', async () => {
    const { ios, target } = await project();
    const neighbor = path.join(path.dirname(target), 'AnotherWidget.swift');
    await writeFile(neighbor, 'untouched');
    await installCalendarProvider(ios, mobileRoot);
    const result = await readFile(target, 'utf8');
    expect(result).toContain('provider: VibesetCalendarProvider()');
    expect(result).toContain('VibesetCalendarEntryView(entry: entry)');
    expect(result).toContain('.supportedFamilies([.systemSmall, .systemMedium])');
    expect(result).toContain('.configurationDisplayName("Vibeset Calendar")');
    expect(result).toContain('.contentMarginsDisabled()');
    expect(result).toContain(
      '.environment(\\.layoutDirection, props["locale"] as? String == "ar" ? .rightToLeft : .leftToRight)',
    );
    expect(result).not.toContain('provider: WidgetsTimelineProvider(name: name)');
    expect(await readFile(neighbor, 'utf8')).toBe('untouched');
    await installCalendarProvider(ios, mobileRoot);
    expect(await readFile(target, 'utf8')).toBe(result);
  });

  it('keeps isolated SwiftUI rows logical because the generated native view owns direction', async () => {
    const layout = await readFile(path.join(mobileRoot, 'widgets/CalendarWidget.tsx'), 'utf8');
    expect(layout).toContain("const alignment = 'leading'");
    expect(layout).toContain('props.weekdays.map(');
    expect(layout).toContain('week.map(');
    expect(layout).not.toContain('.reverse(');
  });

  it('fails before writing when an upstream provider or view signature changes', async () => {
    const { ios, target } = await project();
    const changed = generatedWidget.replace(
      'WidgetsTimelineProvider(name: name)',
      'FutureProvider()',
    );
    await writeFile(target, changed);
    await expect(installCalendarProvider(ios, mobileRoot)).rejects.toThrow('generation changed');
    expect(await readFile(target, 'utf8')).toBe(changed);
    const provider = await readFile(
      path.join(mobileRoot, 'widgets/native/CalendarProvider.swift'),
      'utf8',
    );
    expect(() =>
      patchCalendarWidgetSource(generatedWidget.replace('WidgetsEntryView', 'NewView'), provider),
    ).toThrow();
    expect(() => patchCalendarWidgetSource(generatedWidget + generatedWidget, provider)).toThrow();
  });

  it('waits for the preceding Expo mod to generate its source before patching it', async () => {
    const { ios, target, root } = await project();
    await rm(target);
    const provider = await readFile(
      path.join(mobileRoot, 'widgets/native/CalendarProvider.swift'),
      'utf8',
    );
    await mkdir(path.join(root, 'widgets/native'), { recursive: true });
    await writeFile(path.join(root, 'widgets/native/CalendarProvider.swift'), provider);
    await writeFile(
      path.join(root, 'widgets/native/PrivacyInfo.xcprivacy'),
      await readFile(path.join(mobileRoot, 'widgets/native/PrivacyInfo.xcprivacy'), 'utf8'),
    );
    const upstream = withDangerousMod({ name: 'Vibeset', slug: 'vibeset' }, [
      'ios',
      async (mod) => {
        await writeFile(target, generatedWidget);
        return mod;
      },
    ]);
    const config = withCalendarProvider(upstream);
    const mod = config.mods?.ios?.dangerous;
    if (!mod) throw new Error('Calendar mod was not registered');
    await mod({
      ...config,
      modResults: null,
      modRawConfig: { name: 'Vibeset', slug: 'vibeset' },
      modRequest: {
        projectRoot: root,
        platformProjectRoot: ios,
        platform: 'ios',
        modName: 'dangerous',
        introspect: false,
      },
    });
    expect(await readFile(target, 'utf8')).toContain('provider: VibesetCalendarProvider()');
  });

  it('refuses redirected generated target directories and does not modify their destination', async () => {
    const { ios, target, root } = await project();
    await rm(path.dirname(target), { recursive: true });
    const elsewhere = path.join(root, 'other-target');
    await mkdir(elsewhere);
    const outsideFile = path.join(elsewhere, 'VibesetCalendar.swift');
    await writeFile(outsideFile, generatedWidget);
    await symlink(
      elsewhere,
      path.dirname(target),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(installCalendarProvider(ios, mobileRoot)).rejects.toThrow(
      'ordinary extension file',
    );
    expect(await readFile(outsideFile, 'utf8')).toBe(generatedWidget);
  });
});
