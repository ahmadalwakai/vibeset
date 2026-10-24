import type { ThemeDetailDTO } from '../dto';
import { exportSlugSchema } from '../validation/icon-export';
import { themeDetailResponseSchema } from '../validation/theme-detail';

/** The optional wizard theme is fetched independently from the shared app catalogue. */
export async function loadSetupTheme(slug: string, signal?: AbortSignal): Promise<ThemeDetailDTO> {
  const validSlug = exportSlugSchema.parse(slug);
  const response = await fetch(`/api/v1/themes/${encodeURIComponent(validSlug)}`, {
    signal,
    credentials: 'omit',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Theme is unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Theme response is empty');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > 1_048_576) {
        await reader.cancel();
        throw new Error('Theme response is too large');
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const theme = themeDetailResponseSchema.parse(value).data;
  if (theme.slug !== validSlug)
    throw new Error('Theme response does not match the requested theme');
  return theme;
}
