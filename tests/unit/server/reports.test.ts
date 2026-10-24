import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportReporterSchema, submitReportSchema } from '../../../lib/validation/reports';
import type { ReportReporter, SubmitReportInput } from '../../../lib/validation/reports';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/pool', () => ({ dbPool: { transaction: mocks.transaction } }));
import { submitReport } from '../../../server/services/reports';

const themeId = 'abcdefab-1234-4123-8123-abcdefabcdef';
const reportId = '12345678-1234-4123-8123-123456789abc';
const input: SubmitReportInput = { themeId, reason: 'broken', details: 'The image does not load.' };
const visitor: ReportReporter = { kind: 'visitor', ipHash: 'a'.repeat(64) };
const account: ReportReporter = { kind: 'user', userId: 'reporter' };

function transactionFixture(rows: unknown[][], created: unknown[] = [{ id: reportId }]) {
  const predicates: SQL[] = [];
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  const values = vi.fn();
  const returning = vi.fn().mockResolvedValue(created);
  const tx = {
    execute,
    select: vi.fn(() => {
      const query = {
        from: vi.fn(() => query),
        where: vi.fn((predicate: SQL) => {
          predicates.push(predicate);
          return query;
        }),
        orderBy: vi.fn(() => query),
        for: vi.fn().mockImplementation(async () => rows.shift() ?? []),
        limit: vi.fn().mockImplementation(async () => rows.shift() ?? []),
      };
      return query;
    }),
    insert: vi.fn(() => ({ values: values.mockReturnValue({ returning }) })),
  };
  mocks.transaction.mockImplementation(async (run: (transaction: typeof tx) => Promise<unknown>) =>
    run(tx),
  );
  return { tx, execute, values, returning, predicates };
}

beforeEach(() => vi.resetAllMocks());

describe('report validation', () => {
  it('normalizes UUID, text, whitespace and optional empty details', () => {
    expect(
      submitReportSchema.parse({
        ...input,
        themeId: themeId.toUpperCase(),
        details: '  Cafe\u0301\nPhoto  ',
      }),
    ).toEqual({ ...input, details: 'Café\nPhoto' });
    expect(submitReportSchema.parse({ themeId, reason: 'other', details: ' \n ' })).toEqual({
      themeId,
      reason: 'other',
      details: undefined,
    });
    expect(
      submitReportSchema.parse({ themeId, reason: 'copyright', details: 'x'.repeat(1_000) })
        .details,
    ).toHaveLength(1_000);
  });
  it.each([
    { ...input, themeId: `${themeId}\n` },
    { ...input, reason: 'unknown' },
    { ...input, details: 'x'.repeat(1_001) },
    { ...input, details: '\u0344'.repeat(501) },
    { ...input, details: 'hidden\u0000text' },
    { ...input, details: 'hidden\u202etext' },
    { ...input, reporterId: 'another-user' },
    { ...input, reporterIpHash: 'b'.repeat(64) },
    { ...input, status: 'resolved' },
  ])('rejects malformed data or caller-controlled identity/moderation fields', (value) => {
    expect(submitReportSchema.safeParse(value).success).toBe(false);
  });
  it('accepts plain text as text rather than interpreting HTML', () => {
    expect(
      submitReportSchema.parse({
        ...input,
        details: '<img onerror="alert(1)"> is in the description',
      }).details,
    ).toContain('<img');
  });
  it.each([
    { kind: 'visitor', ipHash: '127.0.0.1' },
    { kind: 'visitor', ipHash: `${'a'.repeat(64)}\n` },
    { kind: 'visitor', ipHash: 'A'.repeat(64) },
    { kind: 'user', userId: '' },
    { kind: 'user', userId: 'bad user' },
    { kind: 'system', label: 'spoofed' },
  ])('rejects invalid reporter boundaries', (value) => {
    expect(reportReporterSchema.safeParse(value).success).toBe(false);
  });
});

describe('report service', () => {
  it('rejects malformed boundaries before opening a transaction', async () => {
    await expect(submitReport({ ...input, themeId: 'invalid' }, visitor)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(submitReport(input, { kind: 'visitor', ipHash: 'raw-ip' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('serializes duplicate checks and stores only the visitor salted hash', async () => {
    const fixture = transactionFixture([[{ id: themeId }], []]);
    expect(await submitReport(input, visitor)).toEqual({ data: { id: reportId }, tags: [] });
    expect(fixture.values).toHaveBeenCalledExactlyOnceWith({
      ...input,
      reporterId: null,
      reporterIpHash: visitor.ipHash,
    });
    const lock = new PgDialect().sqlToQuery(fixture.execute.mock.calls[0]?.[0] as SQL);
    expect(lock.sql).toContain('pg_advisory_xact_lock(hashtextextended');
    expect(lock.params).toEqual([
      JSON.stringify(['vibeset:report', themeId, 'visitor', visitor.ipHash]),
    ]);
    const predicate = fixture.predicates[1];
    expect(predicate).toBeDefined();
    if (!predicate) return;
    const duplicate = new PgDialect().sqlToQuery(predicate);
    expect(duplicate.sql).toContain('"reports"."reporter_id" is null');
    expect(duplicate.params).toEqual([themeId, 'open', visitor.ipHash]);
  });
  it('stores a signed-in account without its IP hash after checking fresh eligibility', async () => {
    const fixture = transactionFixture([
      [{ id: account.userId, banned: false }],
      [{ id: themeId }],
      [],
    ]);
    await submitReport(input, account);
    expect(fixture.values).toHaveBeenCalledExactlyOnceWith({
      ...input,
      reporterId: account.userId,
      reporterIpHash: null,
    });
  });
  it('returns the existing open ID without overwriting the original reason/details', async () => {
    const fixture = transactionFixture([[{ id: themeId }], [{ id: reportId }]]);
    expect(
      await submitReport({ ...input, reason: 'spam', details: 'New details' }, visitor),
    ).toEqual({ data: { id: reportId }, tags: [] });
    expect(fixture.tx.insert).not.toHaveBeenCalled();
  });
  it('rejects a missing or unpublished theme before creating a report', async () => {
    const fixture = transactionFixture([[]]);
    await expect(submitReport(input, visitor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fixture.tx.insert).not.toHaveBeenCalled();
    const predicate = fixture.predicates[0];
    expect(predicate).toBeDefined();
    if (predicate)
      expect(new PgDialect().sqlToQuery(predicate).params).toEqual([themeId, 'published']);
  });
  it.each([
    { row: [], code: 'UNAUTHENTICATED' },
    { row: [{ id: account.userId, banned: true }], code: 'FORBIDDEN' },
  ])('rechecks current account eligibility: $code', async ({ row, code }) => {
    const fixture = transactionFixture([row]);
    await expect(submitReport(input, account)).rejects.toMatchObject({ code });
    expect(fixture.tx.insert).not.toHaveBeenCalled();
    expect(fixture.tx.select).toHaveBeenCalledOnce();
  });
  it('does not report success when the insert returns no row', async () => {
    transactionFixture([[{ id: themeId }], []], []);
    await expect(submitReport(input, visitor)).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
