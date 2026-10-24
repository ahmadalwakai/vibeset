import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import { uploads } from '../../db/schema/system';
import type { CreatorContext, CreatorStatus } from '../../lib/creator';
import { CacheTags } from '../../lib/cache-tags';
import { actorSchema, type Actor } from '../../lib/theme-status';
import {
  applyForCreatorSchema,
  checkHandleSchema,
  reviewCreatorSchema,
  updateCreatorProfileSchema,
} from '../../lib/validation/creator';
import type {
  ApplyForCreatorInput,
  ReviewCreatorInput,
  UpdateCreatorProfileInput,
} from '../../lib/validation/creator';
import { auditInsert } from '../audit';
import { AppError } from '../errors';
import { cdnUrl } from '../storage/urls';
import type { CreatorTransaction } from './creator-access';
import { getFeatures } from './settings';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError('VALIDATION');
  return parsed.data;
}
async function requireUserPrincipal(
  tx: CreatorTransaction,
  actor: Actor,
  lock: 'share' | 'update' = 'share',
) {
  const principal = parse(actorSchema, actor);
  if (principal.kind !== 'user') throw new AppError('FORBIDDEN');
  const [row] = await tx
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, principal.userId))
    .for(lock);
  if (!row) throw new AppError('UNAUTHENTICATED');
  if (row.banned) throw new AppError('FORBIDDEN');
  return row;
}
function uniqueHandleError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return Reflect.get(error, 'code') === '23505' || uniqueHandleError(Reflect.get(error, 'cause'));
}
function invalidation(handle: string): string[] {
  return [CacheTags.themes, CacheTags.creator(handle)];
}

export async function applyForCreator(
  input: ApplyForCreatorInput,
  actor: Actor,
): Promise<{ data: { status: CreatorStatus }; tags: string[] }> {
  const value = parse(applyForCreatorSchema, input);
  if (!(await getFeatures()).creatorApplicationsOpen) throw new AppError('FEATURE_DISABLED');
  try {
    return await dbPool.transaction(async (tx) => {
      const principal = await requireUserPrincipal(tx, actor, 'update');
      const [existing] = await tx
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, principal.id))
        .for('update');
      if (existing && existing.status !== 'rejected') throw new AppError('INVALID_STATE');
      const data = {
        handle: value.handle,
        displayName: value.displayName,
        bio: value.bio || null,
        links: value.links,
        isAdult: true,
        status: 'pending' as const,
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        appliedAt: new Date(),
      };
      if (existing)
        await tx.update(creatorProfiles).set(data).where(eq(creatorProfiles.userId, principal.id));
      else await tx.insert(creatorProfiles).values({ ...data, userId: principal.id });
      await tx.execute(
        auditInsert({
          actorId: principal.id,
          action: 'creator.applied',
          entityType: 'creator',
          entityId: principal.id,
          meta: { handle: value.handle, reapplied: !!existing },
        }),
      );
      return {
        data: { status: 'pending' as const },
        tags: [
          ...new Set([
            ...invalidation(value.handle),
            ...(existing ? invalidation(existing.handle) : []),
          ]),
        ],
      };
    });
  } catch (error) {
    if (uniqueHandleError(error))
      throw new AppError('CONFLICT', 'Handle is unavailable', { handle: ['unavailable'] });
    throw error;
  }
}

export async function checkHandle(
  input: { handle: string },
  actor: Actor,
): Promise<{ data: { available: boolean }; tags: string[] }> {
  const value = parse(checkHandleSchema, input);
  return dbPool.transaction(async (tx) => {
    const principal = await requireUserPrincipal(tx, actor);
    const [existing] = await tx
      .select({ userId: creatorProfiles.userId, status: creatorProfiles.status })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.handle, value.handle));
    return {
      data: {
        available: !existing || existing.userId === principal.id,
      },
      tags: [],
    };
  });
}

export async function updateCreatorProfile(
  input: UpdateCreatorProfileInput,
  actor: Actor,
): Promise<{ data: { ok: true }; tags: string[] }> {
  const value = parse(updateCreatorProfileSchema, input);
  return dbPool.transaction(async (tx) => {
    const principal = await requireUserPrincipal(tx, actor);
    const [profile] = await tx
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, principal.id))
      .for('update');
    if (!profile || profile.status !== 'approved') throw new AppError('FORBIDDEN');
    let avatarKey = profile.avatarKey;
    if (value.avatarUploadId) {
      const [avatar] = await tx
        .select({ id: uploads.id, fullKey: uploads.fullKey, incomingKey: uploads.incomingKey })
        .from(uploads)
        .where(
          and(
            eq(uploads.id, value.avatarUploadId),
            eq(uploads.ownerId, principal.id),
            eq(uploads.status, 'ready'),
          ),
        )
        .for('share');
      const prefix = `avatars/${principal.id}/`;
      if (
        !avatar?.fullKey ||
        !avatar.fullKey.startsWith(prefix) ||
        avatar.fullKey.length !== prefix.length + 69 ||
        !/^[a-f0-9]{64}\.webp$/.test(avatar.fullKey.slice(prefix.length)) ||
        avatar.incomingKey !== `uploads/incoming/${principal.id}/avatars/${avatar.id}`
      )
        throw new AppError('FORBIDDEN', 'Avatar must be an owned ready avatar upload');
      avatarKey = avatar.fullKey;
    }
    const data = {
      displayName: value.displayName,
      bio: value.bio || null,
      links: value.links,
      avatarKey,
    };
    if (
      profile.displayName === data.displayName &&
      profile.bio === data.bio &&
      profile.avatarKey === data.avatarKey &&
      profile.links.length === data.links.length &&
      profile.links.every(
        (link, index) =>
          link.label === data.links[index]?.label && link.url === data.links[index]?.url,
      )
    )
      return { data: { ok: true as const }, tags: invalidation(profile.handle) };
    await tx.update(creatorProfiles).set(data).where(eq(creatorProfiles.userId, principal.id));
    await tx.execute(
      auditInsert({
        actorId: principal.id,
        action: 'creator.updated',
        entityType: 'creator',
        entityId: principal.id,
        meta: { handle: profile.handle, avatarChanged: avatarKey !== profile.avatarKey },
      }),
    );
    return { data: { ok: true as const }, tags: invalidation(profile.handle) };
  });
}

export async function reviewCreator(
  input: ReviewCreatorInput,
  actor: Actor,
): Promise<{ data: { status: CreatorStatus }; tags: string[] }> {
  const value = parse(reviewCreatorSchema, input);
  return dbPool.transaction(async (tx) => {
    const principal = await requireUserPrincipal(tx, actor);
    if (principal.role !== 'admin') throw new AppError('FORBIDDEN');
    const [profile] = await tx
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, value.userId))
      .for('update');
    if (!profile) throw new AppError('NOT_FOUND');
    const permitted =
      value.decision === 'approve'
        ? profile.status === 'pending' || profile.status === 'suspended'
        : value.decision === 'reject'
          ? profile.status === 'pending'
          : profile.status === 'approved';
    if (!permitted) throw new AppError('INVALID_STATE');
    const status =
      value.decision === 'approve'
        ? 'approved'
        : value.decision === 'reject'
          ? 'rejected'
          : 'suspended';
    await tx
      .update(creatorProfiles)
      .set({
        status,
        rejectionReason: value.decision === 'approve' ? null : value.reason,
        reviewedAt: new Date(),
        reviewedBy: principal.id,
      })
      .where(eq(creatorProfiles.userId, value.userId));
    await tx.execute(
      auditInsert({
        actorId: principal.id,
        action: `creator.${status}`,
        entityType: 'creator',
        entityId: value.userId,
        meta: {
          before: profile.status,
          after: status,
          ...(value.reason ? { reason: value.reason } : {}),
        },
      }),
    );
    return { data: { status }, tags: invalidation(profile.handle) };
  });
}

/** Internal read; callers establish ownership with their user/creator guard first. */
export async function getCreatorContext(userId: string): Promise<CreatorContext | null> {
  const id = parse(zStringId, userId);
  const { db } = await import('../../db');
  const [row] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, id))
    .limit(1);
  return row
    ? {
        userId: row.userId,
        handle: row.handle,
        displayName: row.displayName,
        bio: row.bio,
        links: row.links,
        avatarUrl: row.avatarKey ? cdnUrl(row.avatarKey) : null,
        status: row.status,
        isAdult: row.isAdult,
        rejectionReason: row.rejectionReason,
        appliedAt: row.appliedAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      }
    : null;
}

const zStringId = actorSchema.options[0].shape.userId;
