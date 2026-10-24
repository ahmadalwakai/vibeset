import { z } from 'zod';

const identifier = z
  .string()
  .min(3)
  .max(255)
  .regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/)
  .refine((value) => !/\s/.test(value));
const identifiers = z.object({
  bundleId: identifier.refine((value) => !/^(?:com|org)\.example(?:\.|$)/.test(value)),
  widgetBundleId: identifier,
  appGroup: identifier.refine((value) => value.startsWith('group.')),
});
const publicOrigin = z
  .string()
  .refine((value) => value === value.trim() && !/[\s\u0000-\u001f\u007f?#]/.test(value))
  .pipe(z.url({ protocol: /^https$/ }))
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  });

export interface NativeIdentifiers {
  bundleId: string;
  widgetBundleId: string;
  appGroup: string;
}

export function readNativeIdentifiers(
  environment: Readonly<Record<string, string | undefined>>,
  required = false,
): NativeIdentifiers | undefined {
  const values = {
    bundleId: environment.VIBESET_IOS_BUNDLE_ID,
    widgetBundleId: environment.VIBESET_IOS_WIDGET_BUNDLE_ID,
    appGroup: environment.VIBESET_IOS_APP_GROUP,
  };
  if (!Object.values(values).some(Boolean) && !required) return undefined;
  const parsed = identifiers.safeParse(values);
  if (
    !parsed.success ||
    !parsed.data.widgetBundleId.toLowerCase().startsWith(`${parsed.data.bundleId.toLowerCase()}.`)
  )
    throw new Error(
      'Configure the verified app ID, distinct widget extension ID and App Group before native generation.',
    );
  return parsed.data;
}

export function assertNativeBuildEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): NativeIdentifiers {
  const ids = readNativeIdentifiers(environment, true);
  if (!ids) throw new Error('Native identifiers are missing.');
  if (
    !publicOrigin.safeParse(environment.EXPO_PUBLIC_API_URL).success ||
    !publicOrigin.safeParse(environment.EXPO_PUBLIC_CDN_URL).success
  )
    throw new Error('Configure verified HTTPS API and CDN origins before building an iOS beta.');
  return ids;
}

export function assertNativeCompileEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): NativeIdentifiers {
  const ids = readNativeIdentifiers(environment, true);
  if (!ids) throw new Error('Native identifiers are missing.');
  if (
    environment.EXPO_PUBLIC_API_URL === undefined &&
    environment.EXPO_PUBLIC_CDN_URL === undefined
  )
    return ids;
  return assertNativeBuildEnvironment(environment);
}
