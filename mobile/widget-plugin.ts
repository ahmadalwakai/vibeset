import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withBaseMod } from 'expo/config-plugins';
import type { ExportedConfig } from 'expo/config-plugins';

const registration =
  'StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name))';
const replacement = 'StaticConfiguration(kind: name, provider: VibesetCalendarProvider())';
const view = 'WidgetsEntryView(entry: entry)';
const marker = '// Vibeset owns this provider;';

/** Fail on upstream generation drift instead of silently shipping a frozen calendar. */
export function patchCalendarWidgetSource(source: string, provider: string): string {
  if (
    !source.includes('struct VibesetCalendar: Widget {') ||
    !source.includes('internal import ExpoWidgets') ||
    !provider.startsWith(marker)
  )
    throw new Error('Unsupported generated Vibeset calendar widget source.');
  if (source.includes(marker)) {
    if (source.includes(replacement) && !source.includes(registration)) return source;
    throw new Error('Inconsistent generated Vibeset calendar widget source.');
  }
  if (source.split(registration).length !== 2 || source.split(view).length !== 2)
    throw new Error('Expo widget provider generation changed; review the calendar plugin.');
  return `${source.replace(registration, replacement).replace(view, 'VibesetCalendarEntryView(entry: entry)')}\n\n${provider}`;
}

/** Only the exact existing generated extension file is overwritten, never node_modules. */
export async function installCalendarProvider(iosRoot: string, projectRoot: string): Promise<void> {
  const root = await realpath(iosRoot);
  const expected = path.join(root, 'ExpoWidgetsTarget', 'VibesetCalendar.swift');
  const actual = await realpath(expected);
  if (actual !== expected)
    throw new Error('The generated Vibeset calendar widget must be an ordinary extension file.');
  const [source, provider] = await Promise.all([
    readFile(actual, 'utf8'),
    readFile(path.join(projectRoot, 'widgets', 'native', 'CalendarProvider.swift'), 'utf8'),
  ]);
  const patched = patchCalendarWidgetSource(source, provider);
  if (patched !== source) await writeFile(actual, patched, 'utf8');
}

/** Register after expo-widgets, only when verified native identifiers are configured. */
const withCalendarProvider = (config: ExportedConfig): ExportedConfig =>
  withBaseMod(config, {
    platform: 'ios',
    mod: 'dangerous',
    async action(mod) {
      // Expo's ordinary withDangerousMod runs newest first. Explicitly let its
      // source-generation chain finish before replacing the one generated file.
      const next = mod.modRequest.nextMod;
      if (!next) throw new Error('Expo widget source generation must precede the calendar plugin.');
      const generated = await next(mod);
      await installCalendarProvider(
        generated.modRequest.platformProjectRoot,
        generated.modRequest.projectRoot,
      );
      return generated;
    },
  });

export default withCalendarProvider;
