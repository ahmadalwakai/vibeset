import { describe, expect, it } from 'vitest';
import { catalogExplainEndpoint } from '../../../scripts/explain-catalog';

const ordinary = 'postgresql://fixture:fake@ordinary.example.test/db';
const isolated = 'postgresql://fixture:fake@isolated.example.test/db';
const source = { DATABASE_URL: ordinary, TEST_DATABASE_URL: isolated, NODE_ENV: 'test' };

describe('catalog EXPLAIN endpoint containment', () => {
  it('accepts only a validated explicit isolated endpoint', () => {
    expect(catalogExplainEndpoint(source)).toBe(isolated);
    expect(() => catalogExplainEndpoint({ DATABASE_URL: ordinary })).toThrow();
    expect(() => catalogExplainEndpoint({ TEST_DATABASE_URL: isolated })).toThrow();
    expect(() =>
      catalogExplainEndpoint({ ...source, TEST_DATABASE_URL: 'https://example.test' }),
    ).toThrow();
  });

  it.each(['NODE_ENV', 'VERCEL_ENV'])('refuses %s production before fixture writes', (key) => {
    expect(() => catalogExplainEndpoint({ ...source, [key]: 'production' })).toThrow('Production');
  });

  it('rejects ordinary pooled and direct endpoints even with a different database name', () => {
    expect(() => catalogExplainEndpoint({ ...source, TEST_DATABASE_URL: ordinary })).toThrow(
      'isolated',
    );
    expect(() =>
      catalogExplainEndpoint({ ...source, TEST_DATABASE_URL: `${ordinary}-other` }),
    ).toThrow('isolated');
    expect(() => catalogExplainEndpoint({ ...source, DATABASE_URL_UNPOOLED: isolated })).toThrow(
      'isolated',
    );
    expect(() =>
      catalogExplainEndpoint({
        ...source,
        DATABASE_URL: 'postgresql://fixture:fake@ep-demo-pooler.example.test/db',
        TEST_DATABASE_URL: 'postgresql://fixture:fake@ep-demo.example.test/other',
      }),
    ).toThrow('isolated');
  });
});
