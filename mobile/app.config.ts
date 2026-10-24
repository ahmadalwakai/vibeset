import 'tsx/cjs';
import type { ExpoConfig } from 'expo/config';
import {
  assertNativeBuildEnvironment,
  assertNativeCompileEnvironment,
  readNativeIdentifiers,
} from './lib/build-config';

export default function appConfig(): ExpoConfig {
  const ids =
    process.env.VIBESET_NATIVE_GENERATE === 'compile'
      ? assertNativeCompileEnvironment(process.env)
      : process.env.VIBESET_NATIVE_GENERATE === '1'
        ? assertNativeBuildEnvironment(process.env)
        : readNativeIdentifiers(process.env);
  const widgets: NonNullable<ExpoConfig['plugins']> = ids
    ? [
        [
          'expo-widgets',
          {
            bundleIdentifier: ids.widgetBundleId,
            groupIdentifier: ids.appGroup,
            widgets: [
              {
                name: 'VibesetCalendar',
                displayName: 'Vibeset Calendar',
                description: 'Your selected Vibeset colours, time and date.',
                ios: {
                  supportedFamilies: ['systemSmall', 'systemMedium'],
                  initialLayout: './widgets/CalendarWidget.tsx',
                  contentMarginsDisabled: true,
                },
                android: null,
              },
            ],
          },
        ],
        './widget-plugin.ts',
      ]
    : [];
  return {
    name: 'Vibeset',
    slug: 'vibeset',
    version: '0.1.0',
    orientation: 'portrait',
    platforms: ['ios'],
    scheme: 'vibeset',
    userInterfaceStyle: 'automatic',
    icon: './assets/app-icon.png',
    locales: { en: './locales/en.json', ar: './locales/ar.json' },
    ios: {
      ...(ids ? { bundleIdentifier: ids.bundleId } : {}),
      supportsTablet: false,
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            // App-local preferences and the calendar's shared App Group storage.
            NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
          },
        ],
      },
    },
    plugins: [
      'expo-font',
      ['expo-localization', { supportedLocales: { ios: ['en', 'ar'] } }],
      [
        'expo-media-library',
        {
          photosPermission: false,
          savePhotosPermission: 'Save the wallpapers you choose to your Photos library.',
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#9734b1',
          image: './assets/app-icon.png',
          imageWidth: 160,
        },
      ],
      ...widgets,
    ],
  };
}
