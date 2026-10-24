import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import type { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import { uploads } from '../../db/schema/system';
import type { ThemeSpec } from '../../lib/render/spec';
import { actorSchema, type Actor } from '../../lib/theme-status';
import { AppError } from '../errors';
import { wallpaperUploadKeys } from '../storage/keys';

export type CreatorTransaction = Parameters<Parameters<typeof dbPool.transaction>[0]>[0];
export interface CreatorPrincipal {
  id: string;
  role: string | null;
  isCreator: boolean;
  profile: { handle: string; status: typeof creatorProfiles.$inferSelect.status } | null;
}
export async function requireCreatorPrincipal(
  tx: CreatorTransaction,
  actor: Actor,
  options: { requireApproved?: boolean } = {},
): Promise<CreatorPrincipal> {
  const parsed = actorSchema.safeParse(actor);
  if (!parsed.success) throw new AppError('VALIDATION');
  if (parsed.data.kind !== 'user') throw new AppError('FORBIDDEN');
  const [principal] = await tx
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, parsed.data.userId))
    .for('share');
  if (!principal) throw new AppError('UNAUTHENTICATED');
  if (principal.banned) throw new AppError('FORBIDDEN');
  const [profile] = await tx
    .select({ handle: creatorProfiles.handle, status: creatorProfiles.status })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, principal.id))
    .for('share');
  const isCreator = profile?.status === 'approved';
  if (!isCreator && (options.requireApproved || principal.role !== 'admin'))
    throw new AppError('FORBIDDEN');
  return { ...principal, isCreator, profile: profile ?? null };
}
export async function authorizeWallpaperPhotos(
  tx: CreatorTransaction,
  userId: string,
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
  const owned = await tx
    .select({ id: uploads.id, fullKey: uploads.fullKey, incomingKey: uploads.incomingKey })
    .from(uploads)
    .where(
      and(eq(uploads.ownerId, userId), eq(uploads.status, 'ready'), inArray(uploads.fullKey, keys)),
    )
    .for('share');
  const allowed = new Set(
    owned
      .filter(
        (row) =>
          row.fullKey === wallpaperUploadKeys(row.id).full &&
          row.incomingKey === `uploads/incoming/${userId}/${row.id}`,
      )
      .map((row) => row.fullKey),
  );
  if (keys.some((key) => !allowed.has(key)))
    throw new AppError('FORBIDDEN', 'Photo must be an owned ready wallpaper upload');
}
