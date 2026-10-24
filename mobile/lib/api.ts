import { z } from 'zod';
import type { Paginated, ThemeCardDTO, ThemeDetailDTO, ThemeListQuery } from '../../lib/dto';
import { serializeThemeListQuery } from '../../lib/validation/theme-query';
import { themeDetailResponseSchema } from '../../lib/validation/theme-detail';
import { themePageResponseSchema } from '../../lib/validation/themes';
import { exportSlugSchema } from '../../lib/validation/icon-export';
import { nativeIconPackResponseSchema } from '../../lib/validation/native-icon-pack';
import type { NativeIconPack } from '../../lib/validation/native-icon-pack';

export type { Paginated, ThemeCardDTO, ThemeDetailDTO, ThemeListQuery } from '../../lib/dto';

export type NativeServiceErrorCode =
  'CONFIG' | 'NETWORK' | 'NOT_FOUND' | 'INVALID_RESPONSE' | 'HTTP';

export class NativeServiceError extends Error {
  constructor(
    readonly code: NativeServiceErrorCode,
    readonly status?: number,
  ) {
    super(`Native service request failed: ${code}`);
    this.name = 'NativeServiceError';
  }
}

function developmentHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  )
    return false;
  const [first, second = 0] = octets;
  return (
    first === 127 ||
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

/** Public configuration only; shared with the native CDN download boundary. */
export function parseNativePublicUrl(value: string | undefined, allowPath = false): URL {
  try {
    if (
      typeof value !== 'string' ||
      value !== value.trim() ||
      /[\u0000-\u0020\u007f\\?#]/u.test(value)
    )
      throw new Error('Invalid public URL');
    const raw = z.url().parse(value);
    const url = new URL(raw);
    const development = typeof __DEV__ !== 'undefined' && __DEV__;
    if (
      url.username ||
      url.password ||
      (!allowPath && url.pathname !== '/') ||
      (url.protocol !== 'https:' &&
        !(development && url.protocol === 'http:' && developmentHost(url.hostname)))
    )
      throw new Error('Invalid public URL');
    return url;
  } catch {
    throw new NativeServiceError('CONFIG');
  }
}

export function getNativeApiOrigin(): string {
  return parseNativePublicUrl(process.env.EXPO_PUBLIC_API_URL).origin;
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason ?? Object.assign(new Error('Request aborted'), { name: 'AbortError' });
}

function readBeforeAbort<T>(start: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = (): void => {
      signal.removeEventListener('abort', aborted);
      reject(signal.reason ?? Object.assign(new Error('Request aborted'), { name: 'AbortError' }));
    };
    if (signal.aborted) {
      aborted();
      return;
    }
    signal.addEventListener('abort', aborted, { once: true });
    try {
      void start().then(
        (value) => {
          signal.removeEventListener('abort', aborted);
          if (signal.aborted) aborted();
          else resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', aborted);
          reject(error);
        },
      );
    } catch (error) {
      signal.removeEventListener('abort', aborted);
      reject(error);
    }
  });
}

async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  assertActive(signal);
  const url = new URL(path, getNativeApiOrigin()).href;
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  // One deadline covers connection, headers and JSON body; receiving headers does not reset it.
  const timeout = setTimeout(() => controller.abort(new NativeServiceError('NETWORK')), 20_000);
  try {
    let response: Response;
    try {
      response = await readBeforeAbort(
        () =>
          fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'omit',
            redirect: 'error',
            signal: controller.signal,
          }),
        controller.signal,
      );
      assertActive(controller.signal);
    } catch (error) {
      assertActive(signal);
      assertActive(controller.signal);
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new NativeServiceError('NETWORK');
    }
    if (response.status === 404) throw new NativeServiceError('NOT_FOUND', 404);
    if (!response.ok) throw new NativeServiceError('HTTP', response.status);
    if (response.redirected || (response.url && response.url !== url))
      throw new NativeServiceError('INVALID_RESPONSE');
    if (
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
    )
      throw new NativeServiceError('INVALID_RESPONSE');
    let value: unknown;
    try {
      value = await readBeforeAbort(() => response.json(), controller.signal);
      assertActive(controller.signal);
    } catch (error) {
      assertActive(signal);
      assertActive(controller.signal);
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new NativeServiceError('INVALID_RESPONSE');
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new NativeServiceError('INVALID_RESPONSE');
    return parsed.data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

export async function fetchThemes(
  query: ThemeListQuery,
  signal?: AbortSignal,
): Promise<Paginated<ThemeCardDTO>> {
  let search: string;
  try {
    search = serializeThemeListQuery(query);
  } catch {
    throw new NativeServiceError('HTTP', 422);
  }
  const response = await request(
    `/api/v1/themes${search ? `?${search}` : ''}`,
    themePageResponseSchema,
    signal,
  );
  return response.data;
}

export async function fetchTheme(slug: string, signal?: AbortSignal): Promise<ThemeDetailDTO> {
  const parsed = exportSlugSchema.safeParse(slug);
  if (!parsed.success) throw new NativeServiceError('HTTP', 422);
  return (
    await request(
      `/api/v1/themes/${encodeURIComponent(parsed.data)}`,
      themeDetailResponseSchema,
      signal,
    )
  ).data;
}

export async function fetchThemeIconPack(
  slug: string,
  signal?: AbortSignal,
): Promise<NativeIconPack> {
  const parsed = exportSlugSchema.safeParse(slug);
  if (!parsed.success) throw new NativeServiceError('HTTP', 422);
  return (
    await request(
      `/api/v1/themes/${encodeURIComponent(parsed.data)}/icons`,
      nativeIconPackResponseSchema,
      signal,
    )
  ).data;
}
