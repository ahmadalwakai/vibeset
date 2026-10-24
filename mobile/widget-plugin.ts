/// <reference types="@expo/config-plugins/build/ts-declarations/xcode" />
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IOSConfig, withBaseMod } from 'expo/config-plugins';
import type { ExportedConfig } from 'expo/config-plugins';
import type { XcodeProject } from 'xcode';

const registration =
  'StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name))';
const replacement = 'StaticConfiguration(kind: name, provider: VibesetCalendarProvider())';
const view = 'WidgetsEntryView(entry: entry)';
const marker = '// Vibeset owns this provider;';
const targetName = 'ExpoWidgetsTarget';
const privacyFileName = 'PrivacyInfo.xcprivacy';

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

async function installWidgetPrivacyManifest(iosRoot: string, projectRoot: string): Promise<void> {
  const root = await realpath(iosRoot);
  const directory = path.join(root, targetName);
  if ((await realpath(directory)) !== directory)
    throw new Error(
      'The generated widget privacy manifest must use an ordinary extension directory.',
    );
  const destination = path.join(directory, privacyFileName);
  try {
    if ((await realpath(destination)) !== destination)
      throw new Error('The generated widget privacy manifest must be an ordinary extension file.');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const source = await readFile(
    path.join(projectRoot, 'widgets', 'native', privacyFileName),
    'utf8',
  );
  await writeFile(destination, source, 'utf8');
}

function resourceReferences(project: XcodeProject, target: string): string[] {
  if (!project.buildPhase('Resources', target))
    throw new Error('The widget extension must have its own Resources build phase.');
  const phase = project.pbxResourcesBuildPhaseObj(target);
  if (
    typeof phase !== 'object' ||
    phase === null ||
    !('files' in phase) ||
    !Array.isArray(phase.files)
  )
    throw new Error('The widget extension must have a valid Resources build phase.');
  return phase.files.map((file: unknown) => {
    if (
      typeof file !== 'object' ||
      file === null ||
      !('value' in file) ||
      typeof file.value !== 'string'
    )
      throw new Error('The widget extension has an unsupported Resources build phase entry.');
    const buildFile = project.pbxBuildFileSection()[file.value];
    if (!buildFile || typeof buildFile.fileRef !== 'string')
      throw new Error('The widget extension has a missing Resources build file.');
    return buildFile.fileRef;
  });
}

function linkWidgetPrivacyManifest(project: XcodeProject): XcodeProject {
  const targetId = project.findTargetKey(targetName);
  const target = targetId ? project.pbxNativeTargetSection()[targetId] : undefined;
  const group = project.pbxGroupByName(targetName);
  if (
    !target ||
    IOSConfig.XcodeUtils.unquote(target.productType) !== 'com.apple.product-type.app-extension' ||
    !group ||
    IOSConfig.XcodeUtils.unquote(group.path ?? '') !== targetName
  )
    throw new Error(
      'Expo must generate the widget extension target and group before its privacy resource.',
    );
  if (!project.buildPhase('Resources', targetId))
    project.addBuildPhase(
      [],
      'PBXResourcesBuildPhase',
      'Resources',
      targetId,
      undefined,
      undefined,
    );

  const existing = group.children.find((child) => child.comment === privacyFileName);
  if (existing) {
    const reference = project.pbxFileReferenceSection()[existing.value];
    if (
      !reference ||
      IOSConfig.XcodeUtils.unquote(reference.path ?? '') !== privacyFileName ||
      !resourceReferences(project, targetId).includes(existing.value)
    )
      throw new Error('The widget privacy manifest has inconsistent target resource membership.');
    return project;
  }
  IOSConfig.XcodeUtils.addResourceFileToGroup({
    filepath: privacyFileName,
    groupName: targetName,
    isBuildFile: true,
    project,
    targetUuid: targetId,
  });
  const resource = group.children.find((child) => child.comment === privacyFileName);
  if (!resource || !resourceReferences(project, targetId).includes(resource.value))
    throw new Error('The widget privacy manifest was not added to extension resources.');
  return project;
}

/** Register after expo-widgets, only when verified native identifiers are configured. */
const withCalendarProvider = (config: ExportedConfig): ExportedConfig => {
  config = withBaseMod(config, {
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
      await installWidgetPrivacyManifest(
        generated.modRequest.platformProjectRoot,
        generated.modRequest.projectRoot,
      );
      return generated;
    },
  });
  return withBaseMod<XcodeProject>(config, {
    platform: 'ios',
    mod: 'xcodeproj',
    async action(mod) {
      const next = mod.modRequest.nextMod;
      if (!next)
        throw new Error('Expo widget target generation must precede its privacy resource.');
      const generated = await next(mod);
      generated.modResults = linkWidgetPrivacyManifest(generated.modResults);
      return generated;
    },
  });
};

export default withCalendarProvider;
