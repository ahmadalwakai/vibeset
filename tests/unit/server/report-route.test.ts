import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportErrorResponseSchema, reportResponseSchema } from '../../../lib/validation/reports';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getIpHash: vi.fn(),
  rateLimit: vi.fn(),
  getFeatures: vi.fn(),
  submitReport: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  getSession: mocks.getSession,
  requireUser: vi.fn(),
  requireCreator: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: mocks.getIpHash }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: mocks.getFeatures }));
vi.mock('../../../server/services/reports', () => ({ submitReport: mocks.submitReport }));
import { POST } from '../../../app/api/v1/reports/route';
import { submitReport as webSubmitReport } from '../../../server/actions/reports';
import { AppError } from '../../../server/errors';

const themeId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const input = { themeId, reason: 'inappropriate', details: 'Please review this image.' };
const ipHash = 'a'.repeat(64);

function request(body: unknown = input, headers?: Readonly<Record<string, string>>): Request {
  return new Request('https://vibeset.test/api/v1/reports', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getSession.mockResolvedValue(null);
  mocks.getIpHash.mockResolvedValue(ipHash);
  mocks.rateLimit.mockResolvedValue({ allowed: true, count: 1 });
  mocks.getFeatures.mockResolvedValue({ reportsEnabled: true });
  mocks.submitReport.mockResolvedValue({ data: { id }, tags: [] });
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/v1/reports shares website admission and moderation service', () => {
  it('accepts an anonymous native report with normalized content and the shared IP budget', async () => {
    const response = await POST(
      request({ ...input, themeId: themeId.toUpperCase(), details: ' Cafe\u0301 ' }),
    );
    expect(response.status).toBe(200);
    expect(reportResponseSchema.parse(await response.json())).toEqual({ data: { id } });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.submitReport).toHaveBeenCalledExactlyOnceWith(
      { ...input, details: 'Café' },
      { kind: 'visitor', ipHash },
    );
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith(`report:ip:${ipHash}`, 5, 3600);
  });

  it('shares the exact same limiter bucket with the website action', async () => {
    await webSubmitReport(input);
    await POST(request());
    expect(mocks.rateLimit.mock.calls).toEqual([
      [`report:ip:${ipHash}`, 5, 3600],
      [`report:ip:${ipHash}`, 5, 3600],
    ]);
  });

  it('accepts the maximum canonical details length even when JSON escapes increase byte size', async () => {
    const details = 'أ'.repeat(1000);
    const json = JSON.stringify({ ...input, details }).replaceAll('أ', '\\u0623');
    expect(new TextEncoder().encode(json).byteLength).toBeGreaterThan(6000);
    const response = await POST(request(json));
    expect(response.status).toBe(200);
    expect(mocks.submitReport).toHaveBeenCalledWith(
      { ...input, details },
      { kind: 'visitor', ipHash },
    );
  });

  it('uses an optional authenticated principal and never falls back to anonymous after a fresh ban rejection', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'reporter', banned: false },
      session: { id: 'session' },
    });
    mocks.submitReport.mockRejectedValue(new AppError('FORBIDDEN', 'private moderation detail'));
    const response = await POST(request(input, { cookie: 'better-auth.session_token=opaque' }));
    expect(response.status).toBe(403);
    expect(mocks.submitReport).toHaveBeenCalledExactlyOnceWith(input, {
      kind: 'user',
      userId: 'reporter',
    });
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith('report:user:reporter', 5, 3600);
    expect(await response.text()).not.toContain('private moderation detail');
  });

  it('blocks a banned optional session before feature checks or rate consumption', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'reporter', banned: true } });
    const response = await POST(request(input, { cookie: 'better-auth.session_token=opaque' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(mocks.getFeatures).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });

  it('honours the feature flag before consuming the shared budget', async () => {
    mocks.getFeatures.mockResolvedValue({ reportsEnabled: false });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FEATURE_DISABLED' } });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });

  it('maps rate exhaustion to429 without submitting or returning a report identity', async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, count: 6 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    const body: unknown = await response.json();
    expect(reportErrorResponseSchema.parse(body)).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    expect(body).not.toHaveProperty('data');
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });

  it.each(['NOT_FOUND', 'UNAUTHENTICATED'] as const)(
    'maps service %s without exposing its private message',
    async (code) => {
      mocks.submitReport.mockRejectedValue(new AppError(code, 'private SQL or account context'));
      const response = await POST(request());
      expect(response.status).toBe(code === 'NOT_FOUND' ? 404 : 401);
      expect(await response.json()).toEqual({
        error: { code, message: new AppError(code).message },
      });
    },
  );

  it.each([
    'invalid JSON',
    { ...input, reporterId: 'victim' },
    { ...input, reporterIpHash: ipHash },
    { ...input, reason: 'unknown' },
    { ...input, details: 'x'.repeat(1001) },
    { ...input, details: 'x'.repeat(9000) },
  ])('rejects malformed, oversized or identity-spoofing input before admission', async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });

  it('requires JSON and rejects a supplied cross-origin before session lookup', async () => {
    expect((await POST(request(input, { 'content-type': 'text/plain' }))).status).toBe(422);
    expect((await POST(request(input, { origin: 'https://other.test' }))).status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.submitReport).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request(input, {
            origin: 'https://vibeset.test',
            'content-type': 'application/json; charset=utf-8',
          }),
        )
      ).status,
    ).toBe(200);
  });

  it('returns a sanitized500 for an unexpected failure or invalid service output', async () => {
    mocks.submitReport.mockRejectedValueOnce(new Error('postgres password=private'));
    const failure = await POST(request());
    expect(failure.status).toBe(500);
    expect(await failure.text()).not.toContain('private');
    mocks.submitReport.mockResolvedValueOnce({ data: { id: 'invalid' }, tags: [] });
    const invalid = await POST(request());
    expect(invalid.status).toBe(500);
    expect(await invalid.json()).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
