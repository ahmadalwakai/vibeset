import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { initialCalendarWidgetProps } from '../widgets/initial-props';
import { buildCalendarDateFields, calendarWidgetPropsSchema } from '../widgets/model';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const temporaryRoot = path.resolve(mobileRoot, '../.tmp');
const require = createRequire(import.meta.url);
const widgetsRoot = path.dirname(require.resolve('expo-widgets/package.json'));
const registrySchema = z.strictObject({
  widgets: z.strictObject({
    VibesetCalendar: z.strictObject({
      layout: z.string().min(1),
      initialProps: calendarWidgetPropsSchema,
    }),
  }),
});

describe('actual Expo widget build phase', () => {
  it('bundles the real runtime and calendar registry without prebuild, Apple IDs or app validators', async () => {
    await mkdir(temporaryRoot, { recursive: true });
    const temporary = await mkdtemp(path.join(temporaryRoot, 'widget-bundles-'));
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      CI: '1',
      EXPO_NO_DOTENV: '1',
      NODE_BINARY: process.execPath,
    };
    for (const key of [
      'VIBESET_NATIVE_GENERATE',
      'VIBESET_IOS_BUNDLE_ID',
      'VIBESET_IOS_WIDGET_BUNDLE_ID',
      'VIBESET_IOS_APP_GROUP',
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_CDN_URL',
    ])
      delete environment[key];
    try {
      const runtimeFile = path.join(temporary, 'ExpoWidgets.bundle');
      const registryFile = path.join(temporary, 'ExpoWidgetsLayoutRegistry.json');
      const configFile = path.join(temporary, 'registry-config.json');
      await writeFile(
        configFile,
        JSON.stringify({
          widgets: [{ name: 'VibesetCalendar', initialLayout: './widgets/CalendarWidget.tsx' }],
        }),
      );
      for (const args of [
        [path.join(widgetsRoot, 'scripts/build-bundle.mjs'), mobileRoot, 'ios', runtimeFile],
        [
          path.join(widgetsRoot, 'scripts/build-layout-registry.mjs'),
          mobileRoot,
          'ios',
          registryFile,
          configFile,
        ],
      ])
        execFileSync(process.execPath, args, {
          cwd: mobileRoot,
          env: environment,
          encoding: 'utf8',
          timeout: 120_000,
        });
      const runtime = await readFile(runtimeFile, 'utf8');
      expect(runtime.length).toBeGreaterThan(0);
      const raw: unknown = JSON.parse(await readFile(registryFile, 'utf8'));
      const entry = registrySchema.parse(raw).widgets.VibesetCalendar;
      expect(entry.initialProps).toMatchObject({ active: false, themeId: null, themeName: '' });
      const context = vm.createContext({});
      vm.runInContext(runtime, context);
      vm.runInContext(`globalThis.__expoWidgetLayout = (${entry.layout});`, context);
      const active = calendarWidgetPropsSchema.parse({
        ...initialCalendarWidgetProps('ar'),
        ...buildCalendarDateFields(new Date(2026, 9, 24, 9, 41), 'ar'),
        active: true,
        themeId: '00000000-0000-4000-8000-000000000001',
        themeName: 'تقويم الاختبار',
      });
      for (const widgetFamily of ['systemSmall', 'systemMedium']) {
        for (const props of [entry.initialProps, active]) {
          const result: unknown = vm.runInContext(
            `globalThis.__expoWidgetRender(${JSON.stringify(props)}, ${JSON.stringify({ widgetFamily })});`,
            context,
          );
          expect(JSON.stringify(result)).toContain(
            props.active ? props.themeName : props.emptyTitle,
          );
          expect(JSON.stringify(result)).toContain(
            props.active ? props.dayLabel : props.emptyDescription,
          );
        }
      }
    } finally {
      const relative = path.relative(temporaryRoot, temporary);
      if (
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        !relative.startsWith('widget-bundles-')
      )
        throw new Error('Refusing to remove a widget test directory outside the temporary root.');
      await rm(temporary, { recursive: true, force: true });
    }
  }, 180_000);
});
