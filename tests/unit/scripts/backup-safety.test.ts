import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertPostgresVersions,
  assertPrivateBackupPolicy,
  assertRestoreTarget,
  backupObjectKey,
  parseBackupConfig,
  postgresEnvironment,
} from '../../../scripts/backup-safety';
import { verifyPrivateBucket } from '../../../scripts/db-backup';

const source =
  'postgresql://owner:p%40ss@ep-production.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const target = 'postgresql://owner:other@ep-restore.eu-west-2.aws.neon.tech/neondb?sslmode=require';
const configuration = {
  BACKUP_DATABASE_URL_UNPOOLED: source,
  BACKUP_R2_ACCOUNT_ID: 'a'.repeat(32),
  BACKUP_R2_BUCKET: 'vibeset-private-backups',
  R2_ASSETS_BUCKET: 'vibeset-assets',
  BACKUP_R2_ACCESS_KEY_ID: 'backup-id',
  BACKUP_R2_SECRET_ACCESS_KEY: 'backup-secret',
  BACKUP_CF_API_TOKEN: 'read-config-token',
  BACKUP_PG_MAJOR: '17',
};
const managed = { success: true, result: { enabled: false } };
const custom = { success: true, result: { domains: [] } };
const rule = {
  id: 'expire-backups',
  enabled: true,
  conditions: { prefix: 'backups/' },
  deleteObjectsTransition: { condition: { type: 'Age', maxAge: 60 * 86_400 } },
};
const lifecycle = { success: true, result: { rules: [rule] } };
const branch = {
  branch: { id: 'br-isolated', default: false, protected: false, parent_id: 'br-empty' },
};
const endpoints = {
  endpoints: [{ branch_id: 'br-isolated', host: new URL(target).hostname, type: 'read_write' }],
};
afterEach(() => vi.unstubAllGlobals());

describe('private backup safety boundaries', () => {
  it('requires dedicated complete configuration and never falls back to asset credentials', () => {
    expect(parseBackupConfig(configuration).BACKUP_R2_BUCKET).toBe('vibeset-private-backups');
    for (const key of Object.keys(configuration))
      expect(() => parseBackupConfig({ ...configuration, [key]: '' })).toThrow();
    expect(() =>
      parseBackupConfig({ ...configuration, BACKUP_R2_BUCKET: 'vibeset-assets' }),
    ).toThrow();
    expect(() =>
      parseBackupConfig({ R2_ACCESS_KEY_ID: 'ordinary', R2_SECRET_ACCESS_KEY: 'ordinary' }),
    ).toThrow();
  });
  it.each([
    source.replace('ep-production.', 'ep-production-pooler.'),
    source.replace('.neon.tech', '.example.com'),
    source.replace('sslmode=require', 'sslmode=disable'),
    source.replace('owner:p%40ss', 'owner'),
    source + '#fragment',
  ])('refuses unsafe/direct-URL violations', (value) => {
    expect(() =>
      parseBackupConfig({ ...configuration, BACKUP_DATABASE_URL_UNPOOLED: value }),
    ).toThrow();
  });
  it('passes decoded credentials through environment only and requires TLS', () => {
    expect(postgresEnvironment(source)).toMatchObject({
      PGUSER: 'owner',
      PGPASSWORD: 'p@ss',
      PGDATABASE: 'neondb',
      PGSSLMODE: 'require',
      PGCHANNELBINDING: 'require',
      PGCONNECT_TIMEOUT: '10',
    });
  });
  it('requires disabled public access and a complete sixty-day prefix policy', () => {
    expect(() => assertPrivateBackupPolicy(managed, custom, lifecycle)).not.toThrow();
    expect(() =>
      assertPrivateBackupPolicy({ success: true, result: { enabled: true } }, custom, lifecycle),
    ).toThrow();
    expect(() =>
      assertPrivateBackupPolicy(
        managed,
        { success: true, result: { domains: [{ domain: 'cdn.example.invalid', enabled: false }] } },
        lifecycle,
      ),
    ).toThrow();
    for (const changed of [
      { ...rule, enabled: false },
      { ...rule, conditions: { prefix: 'backups/partial/' } },
      { ...rule, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 30 * 86_400 } } },
    ])
      expect(() =>
        assertPrivateBackupPolicy(managed, custom, { success: true, result: { rules: [changed] } }),
      ).toThrow();
    expect(() =>
      assertPrivateBackupPolicy(managed, custom, {
        success: true,
        result: {
          rules: [
            rule,
            {
              ...rule,
              conditions: { prefix: 'backups/partial/' },
              deleteObjectsTransition: { condition: { type: 'Age', maxAge: 1 } },
            },
          ],
        },
      }),
    ).toThrow();
    expect(() => assertPrivateBackupPolicy({ success: false }, custom, lifecycle)).toThrow();
  });
  it('verifies all privacy facts with authenticated bounded read requests', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(managed))
      .mockResolvedValueOnce(Response.json(custom))
      .mockResolvedValueOnce(Response.json(lifecycle));
    vi.stubGlobal('fetch', fetcher);
    await verifyPrivateBucket(parseBackupConfig(configuration));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls.every(
        ([url, options]) =>
          String(url).startsWith('https://api.cloudflare.com/client/v4/accounts/') &&
          options.headers.authorization === 'Bearer read-config-token' &&
          options.signal instanceof AbortSignal &&
          options.redirect === 'error',
      ),
    ).toBe(true);
  });
  it('matches pg_dump and configured major to the actual server major', () => {
    expect(() =>
      assertPostgresVersions('170004\n', 'pg_dump (PostgreSQL) 17.4 (Ubuntu)', '17'),
    ).not.toThrow();
    expect(() => assertPostgresVersions('170004', 'pg_dump (PostgreSQL) 18.0', '17')).toThrow();
    expect(() => assertPostgresVersions('180000', 'pg_dump (PostgreSQL) 17.4', '17')).toThrow();
  });
  it('creates unique safe UTC keys for reruns without overwriting the weekly backup', () => {
    expect(backupObjectKey(new Date('2026-10-24T23:30:00-07:00'), '123-2')).toBe(
      'backups/vibeset-2026-10-25-123-2.sql.gz',
    );
    expect(() => backupObjectKey(new Date(), '../escape')).toThrow();
    expect(() => backupObjectKey(new Date(), '123\n')).toThrow();
  });
  it('requires a separate unprotected nondefault branch whose write endpoint exactly matches', () => {
    expect(() =>
      assertRestoreTarget(source, target, 'br-isolated', branch, endpoints),
    ).not.toThrow();
    expect(() => assertRestoreTarget(source, source, 'br-isolated', branch, endpoints)).toThrow();
    for (const patch of [
      { default: true },
      { protected: true },
      { parent_id: '' },
      { id: 'br-other' },
    ])
      expect(() =>
        assertRestoreTarget(
          source,
          target,
          'br-isolated',
          { branch: { ...branch.branch, ...patch } },
          endpoints,
        ),
      ).toThrow();
    expect(() =>
      assertRestoreTarget(source, target, 'br-isolated', branch, {
        endpoints: [{ ...endpoints.endpoints[0], type: 'read_only' }],
      }),
    ).toThrow();
    expect(() => assertRestoreTarget(source, target, 'br-isolated\n', branch, endpoints)).toThrow();
  });
});
