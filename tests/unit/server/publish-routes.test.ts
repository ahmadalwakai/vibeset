import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheTags } from '../../../lib/cache-tags';
import { AppError } from '../../../server/errors';
import { readJsonBody } from '../../../server/request-body';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  publish: vi.fn(),
  cleanup: vi.fn(),
  invalidate: vi.fn(),
  after: vi.fn(),
  secret: 'a'.repeat(32),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/server/guards', () => ({ requireAdmin: mocks.admin }));
vi.mock('@/server/services/theme-publish', () => ({
  publishTheme: mocks.publish,
  cleanupOldVersions: mocks.cleanup,
}));
vi.mock('@/server/cache', () => ({ invalidate: mocks.invalidate }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/env.server', () => ({ env: { INTERNAL_API_SECRET: mocks.secret } }));
import { POST as publish } from '../../../app/api/admin/themes/[id]/publish/route';
import { POST as revalidate } from '../../../app/api/internal/revalidate/route';

const id = 'f5497e73-9a14-4d82-a1eb-baa931101bce';
const context = { params: Promise.resolve({ id }) };
function json(body: string, authorized = false): Request {
  return new Request('http://localhost:3000/api/test', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      ...(authorized ? { authorization: `Bearer ${mocks.secret}` } : {}),
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: 'admin-user' } });
  mocks.publish.mockResolvedValue({
    data: { assetVersion: 1, skipped: false },
    tags: [CacheTags.themes],
    cleanup: { themeId: id, keepFromVersion: 0 },
  });
});

describe('admin publication route', () => {
  it.each([
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
  ] as const)('refuses %s before publication', async (code, status) => {
    mocks.admin.mockRejectedValue(new AppError(code));
    const response = await publish(json('{}'), context);
    expect(response.status).toBe(status);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it.each([
    ['NOT_FOUND', 404],
    ['INVALID_STATE', 409],
    ['CONFLICT', 409],
  ] as const)('maps service %s errors', async (code, status) => {
    mocks.publish.mockRejectedValue(new AppError(code));
    expect((await publish(json('{}'), context)).status).toBe(status);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it('validates JSON, force and UUID input', async () => {
    for (const body of ['invalid', '{"force":"yes"}', '{"extra":true}'])
      expect((await publish(json(body), context)).status).toBe(422);
    expect((await publish(json('{}'), { params: Promise.resolve({ id: 'invalid' }) })).status).toBe(
      422,
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('refuses cross-origin browser publication before storage work', async () => {
    const request = json('{}');
    request.headers.set('origin', 'https://another-site.test');
    expect((await publish(request, context)).status).toBe(403);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('returns committed publication with no-store and defers cleanup', async () => {
    const response = await publish(json('{"force":true}'), context);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ data: { assetVersion: 1, skipped: false } });
    expect(mocks.publish).toHaveBeenCalledWith({
      themeId: id,
      force: true,
      actor: { kind: 'user', userId: 'admin-user', role: 'admin', isCreator: false },
    });
    expect(mocks.invalidate).toHaveBeenCalledWith([CacheTags.themes], 'revalidate');
    expect(mocks.cleanup).not.toHaveBeenCalled();
    const deferred = mocks.after.mock.calls[0]?.[0] as (() => Promise<void>) | undefined;
    expect(deferred).toBeTypeOf('function');
    await deferred?.();
    expect(mocks.cleanup).toHaveBeenCalledWith(id, 0);
  });
  it('does not relabel committed publication when invalidation fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.invalidate.mockImplementation(() => {
      throw new Error('Cache unavailable');
    });
    try {
      expect((await publish(json('{}'), context)).status).toBe(200);
    } finally {
      log.mockRestore();
    }
  });
  it('does not relabel committed publication when cleanup scheduling fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.after.mockImplementation(() => {
      throw new Error('After unavailable');
    });
    try {
      expect((await publish(json('{}'), context)).status).toBe(200);
    } finally {
      log.mockRestore();
    }
  });
});

describe('internal revalidation route', () => {
  it('requires the exact bearer secret and never exposes it', async () => {
    for (const value of [null, 'Basic abc', 'Bearer wrong', `Bearer ${mocks.secret}x`]) {
      const request = json('{"tags":["themes"]}');
      if (value) request.headers.set('authorization', value);
      const response = await revalidate(request);
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain(mocks.secret);
    }
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('validates registry shapes and limits before invalidation', async () => {
    for (const tags of [
      ['unknown'],
      ['theme:../secret'],
      ['creator:ab'],
      ['theme:lavender\n'],
      Array.from({ length: 201 }, () => 'themes'),
    ])
      expect((await revalidate(json(JSON.stringify({ tags }), true))).status).toBe(422);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('revalidates valid registry tags with no-store headers', async () => {
    const tags = [
      CacheTags.themes,
      CacheTags.theme('lavender'),
      CacheTags.creator('creator_1'),
      CacheTags.themes,
    ];
    const response = await revalidate(json(JSON.stringify({ tags }), true));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ data: { revalidated: 3 } });
  });
  it('bounds streamed JSON bytes and rejects invalid UTF-8', async () => {
    await expect(readJsonBody(json('12345'), 4)).rejects.toMatchObject({ code: 'VALIDATION' });
    const invalid = new Request('http://localhost', {
      method: 'POST',
      body: new Uint8Array([255]),
    });
    await expect(readJsonBody(invalid)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
