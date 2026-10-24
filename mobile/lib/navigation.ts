import * as z from 'zod/mini';

export type NativeSetupStep = 'wallpaper' | 'icons' | 'widget';
export type NativeNavigationTarget =
  | Readonly<{ kind: 'theme'; slug: string }>
  | Readonly<{ kind: 'setup'; slug: string; step: NativeSetupStep }>;

// Validate the original wire value before URL parsing could normalize paths,
// decode a separator, strip whitespace or discard empty query delimiters.
const linkSchema = z.string().check(
  z.maxLength(256),
  z.regex(
    /^vibeset:\/\/(theme|setup)\/([a-z0-9][a-z0-9-]{0,159})(?:\?step=(wallpaper|icons|widget))?$/,
  ),
  z.refine((value) => !/\s|[\p{Cc}\p{Cf}]/u.test(value)),
);
const setupStepSchema = z.enum(['wallpaper', 'icons', 'widget']);

/** Navigation only: a deep link never saves files or confirms installation. */
export function parseNativeDeepLink(value: unknown): NativeNavigationTarget | null {
  const parsed = linkSchema.safeParse(value);
  if (!parsed.success) return null;

  const url = new URL(parsed.data);
  const slug = url.pathname.slice(1);
  if (url.hostname === 'theme') {
    return url.search ? null : { kind: 'theme', slug };
  }

  const step = setupStepSchema.safeParse(url.searchParams.get('step') ?? 'wallpaper');
  return step.success ? { kind: 'setup', slug, step: step.data } : null;
}
