import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const execute = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({ db: { execute } }));

import { rateLimit } from '../../../server/rate-limit';

describe('application rate-limit boundary', () => {
  it.each([
    ['', 10, 60],
    ['scope:user', 0, 60],
    ['scope:user', 2.5, 60],
    ['scope:user', 10, 0],
    ['scope:user', 10, Number.POSITIVE_INFINITY],
  ] as const)('rejects invalid key/rule input before querying', async (key, limit, window) => {
    await expect(rateLimit(key, limit, window)).rejects.toThrow(ZodError);
    expect(execute).not.toHaveBeenCalled();
  });
});
