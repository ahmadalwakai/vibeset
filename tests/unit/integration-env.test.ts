import { describe, expect, it } from 'vitest';
import {
  isIntegrationTestFile,
  isolatedIntegrationUrl,
  normalizedDatabaseHost,
} from '../helpers/integration-env';

const ordinary = 'postgresql://fixture:private@ep-main.example.test/database';
const isolated = 'postgresql://fixture:private@ep-test.example.test/database';
const source = {
  DATABASE_URL: ordinary,
  DATABASE_URL_UNPOOLED: ordinary,
  TEST_DATABASE_URL: isolated,
  NODE_ENV: 'test',
};

describe('shared integration preflight', () => {
  it('leaves the environment untouched and allows missing TEST to keep suites skipped', () => {
    const original = { ...source };
    expect(isolatedIntegrationUrl(source)).toBe(isolated);
    expect(source).toEqual(original);
    expect(isolatedIntegrationUrl({ NODE_ENV: 'production' })).toBeNull();
    expect(isolatedIntegrationUrl({ TEST_DATABASE_URL: '  ' })).toBeNull();
  });

  it.each(['NODE_ENV', 'VERCEL_ENV'])('refuses %s production with sanitized diagnostics', (key) => {
    expect(() => isolatedIntegrationUrl({ ...source, [key]: 'production' })).toThrow(
      'refuse production',
    );
  });

  it.each([
    { DATABASE_URL: isolated },
    { DATABASE_URL_UNPOOLED: isolated },
    { TEST_DATABASE_URL: 'postgresql://other:other@EP-MAIN.example.test./other' },
    { TEST_DATABASE_URL: 'postgresql://other:other@ep-main.example.test:6432/other' },
    { TEST_DATABASE_URL: 'postgresql://other:other@ep-main-pooler.example.test/other' },
    { DATABASE_URL: 'postgresql://fixture:private@ep-test-pooler.example.test/database' },
  ])(
    'refuses shared direct/pooled endpoints regardless of credentials or database name',
    (override) => {
      expect(() => isolatedIntegrationUrl({ ...source, ...override })).toThrow('distinct');
    },
  );

  it.each(['not a url', 'https://example.test/database', 'postgresql://host/'])(
    'sanitizes invalid URL errors',
    (value) => {
      expect(() => isolatedIntegrationUrl({ ...source, TEST_DATABASE_URL: value })).toThrow(
        'Integration database configuration is invalid',
      );
      expect(() => isolatedIntegrationUrl({ ...source, DATABASE_URL_UNPOOLED: value })).toThrow(
        'Integration database configuration is invalid',
      );
    },
  );

  it('recognizes only integration test paths across Windows and POSIX workers', () => {
    expect(isIntegrationTestFile('C:\\vibeset-workflow\\tests\\integration\\uploads.test.ts')).toBe(
      true,
    );
    expect(isIntegrationTestFile('/workspace/tests/integration/nested/auth.test.ts')).toBe(true);
    expect(isIntegrationTestFile('tests/integration/db.test.ts')).toBe(true);
    expect(isIntegrationTestFile('/workspace/tests/unit/integration-env.test.ts')).toBe(false);
    expect(isIntegrationTestFile('/workspace/tests/integration/fixture.ts')).toBe(false);
    expect(isIntegrationTestFile(undefined)).toBe(false);
  });

  it('normalizes pooled hosts without retaining credentials, ports or database names', () => {
    expect(
      normalizedDatabaseHost('postgresql://fixture:private@EP-EXAMPLE-pooler.example.test:6432/db'),
    ).toBe('ep-example.example.test');
  });
});
