import { fetch as nativeFetch } from 'expo/fetch';
import {
  submitReportSchema,
  reportResponseSchema,
  reportErrorResponseSchema,
} from '../../lib/validation/reports';
import type { SubmitReportInput } from '../../lib/validation/reports';
import type { ErrorCode } from '../../lib/result';
import { getNativeApiOrigin, NativeServiceError } from './api';

export type NativeReportErrorCode = ErrorCode | 'NETWORK' | 'CONFIG' | 'INVALID_RESPONSE';
export class NativeReportError extends Error {
  constructor(readonly code: NativeReportErrorCode) {
    super(`Native report failed: ${code}`);
    this.name = 'NativeReportError';
  }
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason ?? Object.assign(new Error('Request aborted'), { name: 'AbortError' });
}

/** Only called by explicit Submit. One deadline includes headers and body, even if transport stalls. */
export async function submitThemeReport(
  input: SubmitReportInput,
  signal?: AbortSignal,
): Promise<void> {
  const parsed = submitReportSchema.safeParse(input);
  if (!parsed.success) throw new NativeReportError('VALIDATION');
  assertActive(signal);
  let origin: string;
  try {
    origin = getNativeApiOrigin();
  } catch (error) {
    if (error instanceof NativeServiceError) throw new NativeReportError('CONFIG');
    throw error;
  }
  const url = new URL('/api/v1/reports', origin).href;
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new NativeReportError('NETWORK')), 20_000);
  const aborted = new Promise<never>((_resolve, reject) => {
    const fail = (): void => reject(controller.signal.reason ?? new NativeReportError('NETWORK'));
    controller.signal.addEventListener('abort', fail, { once: true });
    if (controller.signal.aborted) fail();
  });
  try {
    const response = await Promise.race([
      nativeFetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      }),
      aborted,
    ]);
    assertActive(controller.signal);
    if (
      response.redirected ||
      (response.url && response.url !== url) ||
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
    )
      throw new NativeReportError('INVALID_RESPONSE');
    const declaredLength = response.headers.get('content-length');
    if (
      !response.body ||
      (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 8192))
    )
      throw new NativeReportError('INVALID_RESPONSE');
    const reader = response.body.getReader();
    const bytes = new Uint8Array(8192);
    let length = 0;
    try {
      while (true) {
        const { done, value } = await Promise.race([reader.read(), aborted]);
        assertActive(controller.signal);
        if (done) break;
        if (value.byteLength > bytes.byteLength - length)
          throw new NativeReportError('INVALID_RESPONSE');
        bytes.set(value, length);
        length += value.byteLength;
      }
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const body = new TextDecoder().decode(bytes.subarray(0, length));
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      throw new NativeReportError('INVALID_RESPONSE');
    }
    if (!response.ok) {
      const error = reportErrorResponseSchema.safeParse(value);
      if (!error.success) throw new NativeReportError('INVALID_RESPONSE');
      throw new NativeReportError(error.data.error.code);
    }
    if (response.status !== 200 || !reportResponseSchema.safeParse(value).success)
      throw new NativeReportError('INVALID_RESPONSE');
  } catch (error) {
    assertActive(signal);
    if (error instanceof NativeReportError) throw error;
    throw new NativeReportError('NETWORK');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}
