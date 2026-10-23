import 'server-only';

import { AppError } from './errors';

export async function readJsonBody(
  request: Request,
  maxBytes = 65_536,
  allowEmpty = false,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('Invalid body limit');
  const reader = request.body?.getReader();
  if (!reader) {
    if (allowEmpty) return {};
    throw new AppError('VALIDATION', 'A JSON body is required');
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError('VALIDATION', 'Request body is too large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size && allowEmpty) return {};
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new AppError('VALIDATION', 'Invalid JSON body');
  }
}
