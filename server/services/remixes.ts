import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import { uploads } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import { specHash } from '../../lib/render/hash';
import type { ThemeSpec } from '../../lib/render/spec';
import { actorSchema } from '../../lib/theme-status';
import type { Actor } from '../../lib/theme-status';
import {
  deleteRemixSchema,
  saveRemixSchema,
  updateRemixSchema,
} from '../../lib/validation/remixes';
import type {
  DeleteRemixInput,
  RemixData,
  SaveRemixInput,
  UpdateRemixInput,
} from '../../lib/validation/remixes';
import { storageUuidSchema } from '../../lib/validation/storage';
import { auditInsert } from '../audit';
import { AppError } from '../errors';

type Transaction = Parameters<Parameters<typeof dbPool.transaction>[0]>[0];
interface Principal {
  id: string;
  role: string | null;
}
interface RemixResult {
  data: RemixData;
  tags: string[];
}
type UserActor = Extract<Actor, { kind: 'user' }>;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid remix input');
  return parsed.data;
}

function userActor(actor: Actor): UserActor {
  const parsed = parse(actorSchema, actor);
  if (parsed.kind !== 'user') throw new AppError('FORBIDDEN');
  return parsed;
}

async function requirePrincipal(tx: Transaction, actor: UserActor): Promise<Principal> {
  // Hold account eligibility until commit, including against account deletion or a concurrent ban.
  const [principal] = await tx
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, actor.userId))
    .for('share');
  if (!principal) throw new AppError('UNAUTHENTICATED');
  if (principal.banned) throw new AppError('FORBIDDEN');
  return principal;
}

async function authorizePhotos(
  tx: Transaction,
  principal: Principal,
  spec: ThemeSpec,
): Promise<void> {
  const keys = [
    ...new Set(
      [spec.wallpaper, spec.lockWallpaper].flatMap((wallpaper) =>
        wallpaper?.kind === 'image' ? [wallpaper.assetKey] : [],
      ),
    ),
  ];
  if (!keys.length) return;
  if (principal.role !== 'admin') {
    const [creator] = await tx
      .select({ status: creatorProfiles.status })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, principal.id))
      .for('share');
    if (creator?.status !== 'approved') throw new AppError('FORBIDDEN');
  }
  for (const key of keys) {
    const id = key.split('/')[2];
    if (!storageUuidSchema.safeParse(id).success)
      throw new AppError('VALIDATION', 'Invalid photo asset');
  }
  const owned = await tx
    .select({ fullKey: uploads.fullKey })
    .from(uploads)
    .where(
      and(
        eq(uploads.ownerId, principal.id),
        eq(uploads.status, 'ready'),
        inArray(uploads.fullKey, keys),
      ),
    )
    .for('share');
  const authorized = new Set(owned.map(({ fullKey }) => fullKey));
  if (keys.some((key) => !authorized.has(key)))
    throw new AppError('FORBIDDEN', 'Photo asset is not an owned ready upload');
}

async function requireDraft(
  tx: Transaction,
  id: string,
  ownerId: string,
): Promise<typeof themes.$inferSelect> {
  const [theme] = await tx
    .select()
    .from(themes)
    .where(and(eq(themes.id, id), eq(themes.ownerId, ownerId), eq(themes.source, 'remix')))
    .for('update');
  if (!theme) throw new AppError('NOT_FOUND');
  if (theme.status !== 'draft') throw new AppError('INVALID_STATE');
  return theme;
}

function draftPredicate(theme: typeof themes.$inferSelect, ownerId: string) {
  return and(
    eq(themes.id, theme.id),
    eq(themes.ownerId, ownerId),
    eq(themes.source, 'remix'),
    eq(themes.status, 'draft'),
    eq(themes.assetVersion, theme.assetVersion),
    eq(themes.specHash, theme.specHash),
  );
}

export async function saveRemix(input: SaveRemixInput, actor: Actor): Promise<RemixResult> {
  const value = parse(saveRemixSchema, input);
  const identity = userActor(actor);
  const hash = await specHash(value.spec);
  return dbPool.transaction(
    async (tx) => {
      const principal = await requirePrincipal(tx, identity);
      await authorizePhotos(tx, principal, value.spec);
      let remixOfId: string | null = null;
      if (value.remixOfSlug) {
        const [source] = await tx
          .select({ id: themes.id })
          .from(themes)
          .where(and(eq(themes.slug, value.remixOfSlug), eq(themes.status, 'published')))
          .for('share');
        if (!source) throw new AppError('NOT_FOUND');
        remixOfId = source.id;
      }
      const id = randomUUID();
      const [created] = await tx
        .insert(themes)
        .values({
          id,
          slug: `remix-${id}`,
          source: 'remix',
          status: 'draft',
          ownerId: principal.id,
          remixOfId,
          nameEn: value.nameEn,
          spec: value.spec,
          specHash: hash,
        })
        .returning({ id: themes.id });
      if (!created) throw new AppError('INTERNAL', 'Remix was not created');
      await tx.execute(
        auditInsert({
          actorId: principal.id,
          action: 'remix.created',
          entityType: 'theme',
          entityId: id,
          meta: { nameEn: value.nameEn, specHash: hash, remixOfId },
        }),
      );
      return { data: created, tags: [] };
    },
    { isolationLevel: 'read committed' },
  );
}

export async function updateRemix(input: UpdateRemixInput, actor: Actor): Promise<RemixResult> {
  const value = parse(updateRemixSchema, input);
  const identity = userActor(actor);
  const hash = await specHash(value.spec);
  return dbPool.transaction(
    async (tx) => {
      const principal = await requirePrincipal(tx, identity);
      const theme = await requireDraft(tx, value.id, principal.id);
      await authorizePhotos(tx, principal, value.spec);
      if (theme.nameEn === value.nameEn && theme.specHash === hash)
        return { data: { id: theme.id }, tags: [] };
      const [updated] = await tx
        .update(themes)
        .set({ nameEn: value.nameEn, spec: value.spec, specHash: hash })
        .where(draftPredicate(theme, principal.id))
        .returning({ id: themes.id });
      if (!updated) throw new AppError('CONFLICT');
      await tx.execute(
        auditInsert({
          actorId: principal.id,
          action: 'remix.updated',
          entityType: 'theme',
          entityId: theme.id,
          meta: {
            before: { nameEn: theme.nameEn, specHash: theme.specHash },
            after: { nameEn: value.nameEn, specHash: hash },
          },
        }),
      );
      return { data: updated, tags: [] };
    },
    { isolationLevel: 'read committed' },
  );
}

export async function deleteRemix(input: DeleteRemixInput, actor: Actor): Promise<RemixResult> {
  const value = parse(deleteRemixSchema, input);
  const identity = userActor(actor);
  return dbPool.transaction(
    async (tx) => {
      const principal = await requirePrincipal(tx, identity);
      const theme = await requireDraft(tx, value.id, principal.id);
      const [deleted] = await tx
        .delete(themes)
        .where(draftPredicate(theme, principal.id))
        .returning({ id: themes.id });
      if (!deleted) throw new AppError('CONFLICT');
      await tx.execute(
        auditInsert({
          actorId: principal.id,
          action: 'remix.deleted',
          entityType: 'theme',
          entityId: theme.id,
          meta: { nameEn: theme.nameEn, specHash: theme.specHash },
        }),
      );
      return { data: deleted, tags: [] };
    },
    { isolationLevel: 'read committed' },
  );
}
