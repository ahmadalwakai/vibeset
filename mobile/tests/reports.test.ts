import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_REASONS } from '../../lib/validation/reports';
import { NativeReportError, submitThemeReport } from '../lib/reports';

const { transport } = vi.hoisted(() => ({ transport: vi.fn<typeof fetch>() }));
vi.mock('expo/fetch', () => ({ fetch: transport }));
const id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const input = {
  themeId: id,
  reason: 'inappropriate' as const,
  details: 'Please review this image.',
};
beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.vibeset.test');
  vi.stubGlobal('__DEV__', false);
  vi.stubGlobal('fetch', transport);
  transport.mockReset();
  transport.mockResolvedValue(Response.json({ data: { id } }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('explicit native reports', () => {
  it('has no automatic request and submits canonical input without cookies or identity fields', async () => {
    expect(transport).not.toHaveBeenCalled();
    await submitThemeReport({ ...input, themeId: id.toUpperCase(), details: '  cafe\u0301  ' });
    expect(transport).toHaveBeenCalledExactlyOnceWith('https://api.vibeset.test/api/v1/reports', {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      signal: expect.any(AbortSignal),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, details: 'café' }),
    });
  });
  it.each(REPORT_REASONS)('uses the web canonical %s reason', async (reason) => {
    await submitThemeReport({ themeId: id, reason });
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({ themeId: id, reason });
  });
  it('refuses overlong, malformed or injected data before any request', async () => {
    for (const value of [
      { ...input, details: 'x'.repeat(1001) },
      { ...input, themeId: `${id}\n` },
      { ...input, userId: 'other-account' },
      { ...input, reporterIpHash: 'a'.repeat(64) },
    ])
      await expect(submitThemeReport(value)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(['RATE_LIMITED', 'FEATURE_DISABLED', 'NOT_FOUND', 'FORBIDDEN', 'VALIDATION'])(
    'preserves the canonical %s code while never exposing service messages',
    async (code) => {
      transport.mockResolvedValue(
        Response.json({ error: { code, message: 'private internal data' } }, { status: 429 }),
      );
      try {
        await submitThemeReport(input);
        throw new Error('Expected failure');
      } catch (error) {
        expect(error).toBeInstanceOf(NativeReportError);
        expect(error).toMatchObject({ code });
        expect(String(error)).not.toContain('private internal data');
      }
    },
  );
  it.each([
    { data: { id: 'invalid' } },
    { data: { id }, userId: 'injected' },
    { data: { id, token: 'injected' } },
    { ok: true },
  ])('never claims success for an invalid response %#', async (body) => {
    transport.mockResolvedValue(Response.json(body));
    await expect(submitThemeReport(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects redirects, foreign response URLs, HTML and oversized JSON', async () => {
    for (const response of [
      Object.defineProperty(Response.json({ data: { id } }), 'redirected', { value: true }),
      Object.defineProperty(Response.json({ data: { id } }), 'url', {
        value: 'https://foreign.test/report',
      }),
      new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
      new Response(' '.repeat(8193), { headers: { 'Content-Type': 'application/json' } }),
    ]) {
      transport.mockResolvedValue(response);
      await expect(submitThemeReport(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });
  it('allows explicit retry after a transport failure and only then reports completion', async () => {
    transport.mockRejectedValueOnce(new Error('private transport failure'));
    await expect(submitThemeReport(input)).rejects.toMatchObject({ code: 'NETWORK' });
    await expect(submitThemeReport(input)).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('caps streamed bytes before accumulating an oversized body and cancels the unread remainder', async () => {
    const cancel = vi.fn();
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          sent += 1;
          controller.enqueue(new Uint8Array(5000));
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    transport.mockResolvedValue(
      new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
    );
    await expect(submitThemeReport(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(sent).toBe(2);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('refuses unconfigured origin without sending a report', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', '');
    await expect(submitThemeReport(input)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('does not request after caller cancellation and propagates cancellation during a stalled request', async () => {
    const before = new AbortController();
    before.abort();
    await expect(submitThemeReport(input, before.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(transport).not.toHaveBeenCalled();
    transport.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = submitThemeReport(input, controller.signal);
    const checked = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await checked;
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it.each(['headers', 'body'])(
    'bounds a stalled %s phase with one deadline and removes its timer',
    async (phase) => {
      vi.useFakeTimers();
      if (phase === 'headers') transport.mockImplementation(() => new Promise(() => {}));
      else {
        const response = new Response(new ReadableStream<Uint8Array>(), {
          headers: { 'Content-Type': 'application/json' },
        });
        transport.mockResolvedValue(response);
      }
      const pending = submitThemeReport(input);
      const checked = expect(pending).rejects.toMatchObject({ code: 'NETWORK' });
      await vi.advanceTimersByTimeAsync(20_001);
      await checked;
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
