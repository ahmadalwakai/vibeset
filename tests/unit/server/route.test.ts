import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

import { AppError } from '@/server/errors';
import { handleRoute } from '@/server/route';

describe('handleRoute', () => {
  it('keeps the handler response and arguments intact', async () => {
    const handler = handleRoute(async (request: Request, value: number) =>
      Response.json({ path: new URL(request.url).pathname, value }),
    );
    const response = await handler(new Request('https://vibeset.test/api/example'), 42);
    expect(await response.json()).toEqual({ path: '/api/example', value: 42 });
  });

  it.each([
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['RATE_LIMITED', 429],
  ] as const)('maps %s with uncached error headers', async (code, status) => {
    const handler = handleRoute(async () => {
      throw new AppError(code);
    });
    const response = await handler();
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ error: { code } });
  });

  it('maps Zod boundary failures to validation', async () => {
    const handler = handleRoute(async () => {
      z.uuid().parse('invalid');
      return new Response();
    });
    const response = await handler();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: 'VALIDATION', message: 'Invalid input' },
    });
  });

  it('redacts unexpected error details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const handler = handleRoute(async () => {
        throw new Error('private SQL');
      });
      const response = await handler();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('private SQL');
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
});
