import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import plist from '@expo/plist';
import { IOSConfig, withDangerousMod, withXcodeProject } from 'expo/config-plugins';
import type { ExportedConfig, ExportedConfigWithProps } from 'expo/config-plugins';
import { afterEach, describe, expect, it, vi } from 'vitest';
import xcode from 'xcode';
import type { XcodeProject } from 'xcode';
import { z } from 'zod';
import appConfig from '../app.config';
import withCalendarProvider from '../widget-plugin';

// A parsed two-group app project exercises Expo's real resource helpers, rather
// than replacing the project APIs with mocks that could hide target mistakes.
const projectSource = `// !$*UTF8*$!
{
  archiveVersion = 1;
  classes = {};
  objectVersion = 54;
  objects = {
/* Begin PBXProject section */
    A00000000000000000000001 /* Project object */ = {
      isa = PBXProject;
      attributes = {};
      buildConfigurationList = A00000000000000000000008;
      mainGroup = A00000000000000000000002;
      productRefGroup = A00000000000000000000004;
      targets = (A00000000000000000000005 /* Vibeset */);
    };
/* End PBXProject section */
/* Begin PBXGroup section */
    A00000000000000000000002 = {isa = PBXGroup; children = (
      A00000000000000000000003 /* Vibeset */,
      A00000000000000000000004 /* Products */,
    ); sourceTree = "<group>";};
    A00000000000000000000003 /* Vibeset */ = {isa = PBXGroup; children = (); name = Vibeset; path = Vibeset; sourceTree = "<group>";};
    A00000000000000000000004 /* Products */ = {isa = PBXGroup; children = (A00000000000000000000006 /* Vibeset.app */); name = Products; sourceTree = "<group>";};
/* End PBXGroup section */
/* Begin PBXNativeTarget section */
    A00000000000000000000005 /* Vibeset */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = A00000000000000000000008;
      buildPhases = (A00000000000000000000007 /* Resources */);
      buildRules = (); dependencies = ();
      name = Vibeset; productName = Vibeset;
      productReference = A00000000000000000000006;
      productType = "com.apple.product-type.application";
    };
/* End PBXNativeTarget section */
/* Begin PBXFileReference section */
    A00000000000000000000006 /* Vibeset.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; path = Vibeset.app; sourceTree = BUILT_PRODUCTS_DIR;};
/* End PBXFileReference section */
/* Begin PBXResourcesBuildPhase section */
    A00000000000000000000007 /* Resources */ = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;};
/* End PBXResourcesBuildPhase section */
/* Begin XCConfigurationList section */
    A00000000000000000000008 = {isa = XCConfigurationList; buildConfigurations = (A00000000000000000000009 /* Release */); defaultConfigurationName = Release;};
/* End XCConfigurationList section */
/* Begin XCBuildConfiguration section */
    A00000000000000000000009 /* Release */ = {isa = XCBuildConfiguration; buildSettings = {PRODUCT_NAME = Vibeset;}; name = Release;};
/* End XCBuildConfiguration section */
/* Begin PBXBuildFile section */
/* End PBXBuildFile section */
  };
  rootObject = A00000000000000000000001 /* Project object */;
}
`;
const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const roots: string[] = [];
const manifestSchema = z.object({
  NSPrivacyAccessedAPITypes: z.array(
    z.object({
      NSPrivacyAccessedAPIType: z.string(),
      NSPrivacyAccessedAPITypeReasons: z.array(z.string()),
    }),
  ),
});
const resourcePhaseSchema = z.object({ files: z.array(z.object({ value: z.string() })) });

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{
  root: string;
  ios: string;
  project: XcodeProject;
  context: ExportedConfigWithProps<XcodeProject>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibeset-widget-privacy-'));
  roots.push(root);
  const ios = path.join(root, 'ios');
  const projectDirectory = path.join(ios, 'Vibeset.xcodeproj');
  await mkdir(projectDirectory, { recursive: true });
  await mkdir(path.join(ios, 'Vibeset'));
  await writeFile(path.join(ios, 'Vibeset', 'AppDelegate.swift'), 'import Expo\n');
  const projectPath = path.join(projectDirectory, 'project.pbxproj');
  await writeFile(projectPath, projectSource);
  const project = xcode.project(projectPath);
  project.parseSync();
  return {
    root,
    ios,
    project,
    context: {
      name: 'Vibeset',
      slug: 'vibeset',
      modResults: project,
      modRawConfig: { name: 'Vibeset', slug: 'vibeset' },
      modRequest: {
        projectRoot: root,
        platformProjectRoot: ios,
        projectName: 'Vibeset',
        platform: 'ios',
        modName: 'xcodeproj',
        introspect: false,
      },
    },
  };
}

function resources(project: XcodeProject, target: string): string[] {
  return resourcePhaseSchema
    .parse(project.pbxResourcesBuildPhaseObj(target))
    .files.map(({ value }) => project.pbxBuildFileSection()[value]?.fileRef)
    .filter((value): value is string => typeof value === 'string');
}

describe('native App Group required-reason privacy resources', () => {
  it('merges App Group and local defaults reasons without removing existing API reasons or tracking settings', async () => {
    vi.stubEnv('VIBESET_NATIVE_GENERATE', 'compile');
    vi.stubEnv('VIBESET_IOS_BUNDLE_ID', 'com.fixtureowner.vibeset');
    vi.stubEnv('VIBESET_IOS_WIDGET_BUNDLE_ID', 'com.fixtureowner.vibeset.calendar');
    vi.stubEnv('VIBESET_IOS_APP_GROUP', 'group.com.fixtureowner.vibeset');
    vi.stubEnv('EXPO_PUBLIC_API_URL', undefined);
    vi.stubEnv('EXPO_PUBLIC_CDN_URL', undefined);
    const config = appConfig();
    const { ios, context } = await fixture();
    const original = {
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
      ],
    };
    const privacyPath = path.join(ios, 'Vibeset', 'PrivacyInfo.xcprivacy');
    await writeFile(privacyPath, plist.build(original));
    IOSConfig.PrivacyInfo.setPrivacyInfo(context, config.ios?.privacyManifests ?? {});
    const once = await readFile(privacyPath, 'utf8');
    const merged = manifestSchema.parse(plist.parse(once));
    expect(merged.NSPrivacyAccessedAPITypes).toEqual([
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
        NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
      },
      ...original.NSPrivacyAccessedAPITypes.slice(1),
    ]);
    expect(plist.parse(once)).toMatchObject({
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: [],
    });
    IOSConfig.PrivacyInfo.setPrivacyInfo(context, config.ios?.privacyManifests ?? {});
    expect(await readFile(privacyPath, 'utf8')).toBe(once);
  });

  it('copies the real extension manifest and links it only to the generated extension resources, idempotently', async () => {
    const { root, ios, context, project } = await fixture();
    await mkdir(path.join(root, 'widgets/native'), { recursive: true });
    for (const name of ['CalendarProvider.swift', 'PrivacyInfo.xcprivacy'])
      await writeFile(
        path.join(root, 'widgets/native', name),
        await readFile(path.join(mobileRoot, 'widgets/native', name)),
      );
    const upstream = withDangerousMod({ name: 'Vibeset', slug: 'vibeset' }, [
      'ios',
      async (mod) => {
        const directory = path.join(ios, 'ExpoWidgetsTarget');
        await mkdir(directory);
        await writeFile(
          path.join(directory, 'VibesetCalendar.swift'),
          'internal import ExpoWidgets\nstruct VibesetCalendar: Widget {\nStaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in\nWidgetsEntryView(entry: entry)\n}\n}',
        );
        return mod;
      },
    ]);
    const withTarget = withXcodeProject(upstream, (mod) => {
      const added = mod.modResults.addTarget(
        'ExpoWidgetsTarget',
        'app_extension',
        'ExpoWidgetsTarget',
      );
      // expo-widgets writes this safe Swift identifier without quotes.
      added.pbxNativeTarget.name = 'ExpoWidgetsTarget';
      const group = mod.modResults.addPbxGroup([], 'ExpoWidgetsTarget', 'ExpoWidgetsTarget');
      const mainGroup = mod.modResults.getPBXGroupByKey(
        mod.modResults.getFirstProject().firstProject.mainGroup,
      );
      if (!mainGroup) throw new Error('Fixture main group missing.');
      mainGroup.children.push({ value: group.uuid, comment: 'ExpoWidgetsTarget' });
      expect(added).toBeDefined();
      return mod;
    });
    const config = withCalendarProvider(withTarget);
    const dangerous = config.mods?.ios?.dangerous;
    const xcodeMod = config.mods?.ios?.xcodeproj;
    if (!dangerous || !xcodeMod) throw new Error('Widget privacy mods were not registered.');
    await dangerous({
      ...context,
      ...config,
      modResults: null,
      modRequest: { ...context.modRequest, modName: 'dangerous', nextMod: undefined },
    });
    const manifestPath = path.join(ios, 'ExpoWidgetsTarget', 'PrivacyInfo.xcprivacy');
    const result = manifestSchema.parse(plist.parse(await readFile(manifestPath, 'utf8')));
    expect(result.NSPrivacyAccessedAPITypes).toContainEqual({
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['1C8F.1'],
    });

    await xcodeMod({ ...context, ...config });
    const targetId = project.findTargetKey('ExpoWidgetsTarget');
    const resource = project
      .pbxGroupByName('ExpoWidgetsTarget')
      ?.children.find((child) => child.comment === 'PrivacyInfo.xcprivacy');
    if (!resource) throw new Error('Privacy resource was not registered.');
    expect(
      IOSConfig.XcodeUtils.unquote(project.pbxFileReferenceSection()[resource.value]?.path ?? ''),
    ).toBe('PrivacyInfo.xcprivacy');
    expect(resources(project, targetId)).toEqual([resource.value]);
    expect(resources(project, project.getFirstTarget().uuid)).not.toContain(resource.value);

    const first = project.writeSync();
    const again = withCalendarProvider(
      withXcodeProject({ name: 'Vibeset', slug: 'vibeset' }, (mod) => mod),
    ).mods?.ios?.xcodeproj;
    if (!again) throw new Error('Widget privacy mod was not registered.');
    await again(context);
    expect(project.writeSync()).toBe(first);
  });

  it('fails closed if upstream did not generate an extension target', async () => {
    const { context } = await fixture();
    const config: ExportedConfig = withCalendarProvider(
      withXcodeProject({ name: 'Vibeset', slug: 'vibeset' }, (mod) => mod),
    );
    const mod = config.mods?.ios?.xcodeproj;
    if (!mod) throw new Error('Widget privacy mod was not registered.');
    await expect(mod(context)).rejects.toThrow('generate the widget extension target');
  });
});
