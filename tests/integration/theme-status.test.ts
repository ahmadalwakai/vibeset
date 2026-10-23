import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { themes } from '../../db/schema/themes';
import { auditLog } from '../../db/schema/system';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { specHash } from '../../lib/render/hash';
import type { Actor, TransitionTheme } from '../../lib/theme-status';
import type * as ThemeStatusService from '../../server/services/theme-status';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ database: undefined as unknown }));
// This suite can only execute SQL against its explicit isolated test connection.
vi.mock('../../db/index', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('The isolated test database is not initialized');
    return holder.database;
  },
}));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();

describe.skipIf(!TEST_DATABASE_URL)('atomic theme transition audits', () => {
  let database: ReturnType<typeof drizzle>;
  let service: typeof ThemeStatusService;
  const ids: string[] = [];
  const people: string[] = [];
  const tagIds: string[] = [];
  const actor: Actor = { kind: 'system', label: 'integration-status' };

  beforeAll(async () => {
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
    database = drizzle({ client: neon(url) });
    holder.database = database;
    service = await import('../../server/services/theme-status');
  });

  afterAll(async () => {
    try {
      if (ids.length) {
        await database.delete(auditLog).where(inArray(auditLog.entityId, ids));
        await database.delete(themes).where(inArray(themes.id, ids));
      }
      if (people.length) await database.delete(user).where(inArray(user.id, people));
      if (tagIds.length) await database.delete(tags).where(inArray(tags.id, tagIds));
    } finally {
      holder.database = undefined;
    }
  });

  async function createTheme(
    status: 'draft' | 'pending_review' = 'draft',
  ): Promise<TransitionTheme> {
    const id = randomUUID();
    ids.push(id);
    const spec = renderSampleSpec(playgroundStateSchema.parse({}));
    const [theme] = await database
      .insert(themes)
      .values({
        id,
        slug: `integration-status-${id}`,
        nameEn: 'Disposable status regression',
        source: 'generated',
        status,
        spec,
        specHash: await specHash(spec),
      })
      .returning();
    if (!theme) throw new Error('Failed to create an isolated theme fixture');
    return { ...theme, aestheticTagCount: 0 };
  }

  it('does not audit an update rejected by any captured version/status/spec-hash predicate', async () => {
    for (const field of ['version', 'status', 'hash'] as const) {
      const snapshot = await createTheme();
      const statement = service.transitionStatements(snapshot, 'approved', actor);
      await database
        .update(themes)
        .set(
          field === 'version'
            ? { assetVersion: snapshot.assetVersion + 1 }
            : field === 'status'
              ? { status: 'pending_review' }
              : { specHash: 'f'.repeat(64) },
        )
        .where(eq(themes.id, snapshot.id));
      const [result] = await database.batch(statement);
      expect(result.rows).toHaveLength(0);
      expect(
        await database
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(eq(auditLog.entityId, snapshot.id)),
      ).toHaveLength(0);
    }
  }, 30_000);

  it('allows one competing update and records exactly one matching audit', async () => {
    const snapshot = await createTheme('pending_review');
    const outcomes = await Promise.all([
      database.batch(service.transitionStatements(snapshot, 'approved', actor)),
      database.batch(
        service.transitionStatements(snapshot, 'rejected', actor, '<b>Needs revision</b>\u0000'),
      ),
    ]);
    expect(outcomes.map(([result]) => result.rows.length).sort()).toEqual([0, 1]);
    const [theme] = await database
      .select({ status: themes.status, rejectionReason: themes.rejectionReason })
      .from(themes)
      .where(eq(themes.id, snapshot.id));
    if (!theme) throw new Error('Fixture unexpectedly missing');
    const audit = await database
      .select({ action: auditLog.action, actorId: auditLog.actorId, meta: auditLog.meta })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, snapshot.id), eq(auditLog.entityType, 'theme')));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: `theme.status.${theme.status}`,
      actorId: null,
      meta: {
        before: { status: 'pending_review' },
        after: { status: theme.status },
        actor: { kind: 'system', label: 'integration-status' },
      },
    });
    if (theme.status === 'rejected') {
      expect(theme.rejectionReason).toBe('Needs revision');
      expect(audit[0]?.meta).toMatchObject({ reason: 'Needs revision' });
    }
  }, 30_000);

  it('rolls back the state change when the corresponding audit insert fails', async () => {
    const snapshot = await createTheme();
    const missingActor: Actor = {
      kind: 'user',
      role: 'admin',
      isCreator: false,
      userId: `missing-status-actor-${randomUUID()}`,
    };
    await expect(
      database.batch(service.transitionStatements(snapshot, 'approved', missingActor)),
    ).rejects.toThrow();
    const [theme] = await database
      .select({ status: themes.status })
      .from(themes)
      .where(eq(themes.id, snapshot.id));
    expect(theme?.status).toBe('draft');
    expect(
      await database
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(eq(auditLog.entityId, snapshot.id)),
    ).toHaveLength(0);
  }, 30_000);

  it('does not trust a caller creator flag after approval is revoked and only audits a valid submission', async () => {
    const snapshot = await createTheme();
    const suffix = randomUUID();
    const userId = `integration-status-owner-${suffix}`;
    const tagId = randomUUID();
    people.push(userId);
    tagIds.push(tagId);
    await database
      .insert(user)
      .values({
        id: userId,
        name: 'Disposable status owner',
        email: `${userId}@example.com`,
        role: 'user',
      });
    await database
      .insert(creatorProfiles)
      .values({
        userId,
        handle: `status_${suffix.replaceAll('-', '').slice(0, 12)}`,
        displayName: 'Disposable creator',
        isAdult: true,
        status: 'suspended',
      });
    await database
      .insert(tags)
      .values({
        id: tagId,
        slug: `status-${suffix.slice(0, 20)}`,
        kind: 'aesthetic',
        nameEn: 'Disposable aesthetic',
        nameAr: 'اختبار',
      });
    await database.insert(themeTags).values({ themeId: snapshot.id, tagId });
    await database
      .update(themes)
      .set({ ownerId: userId, source: 'creator' })
      .where(eq(themes.id, snapshot.id));
    const captured: TransitionTheme = {
      ...snapshot,
      source: 'creator',
      ownerId: userId,
      aestheticTagCount: 1,
    };
    const creator: Actor = { kind: 'user', userId, role: 'user', isCreator: true };
    const [blocked] = await database.batch(
      service.transitionStatements(captured, 'pending_review', creator),
    );
    expect(blocked.rows).toHaveLength(0);
    expect(
      await database
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(eq(auditLog.entityId, snapshot.id)),
    ).toHaveLength(0);

    await database
      .update(creatorProfiles)
      .set({ status: 'approved' })
      .where(eq(creatorProfiles.userId, userId));
    const [submitted] = await database.batch(
      service.transitionStatements(captured, 'pending_review', creator),
    );
    expect(submitted.rows).toEqual([{ id: snapshot.id, status: 'pending_review' }]);
    const [theme] = await database
      .select({ submittedAt: themes.submittedAt })
      .from(themes)
      .where(eq(themes.id, snapshot.id));
    expect(theme?.submittedAt).toBeInstanceOf(Date);
    expect(
      await database
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(eq(auditLog.entityId, snapshot.id)),
    ).toHaveLength(1);
  }, 30_000);
});
