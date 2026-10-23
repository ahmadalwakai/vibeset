import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index';
import { dbPool } from '../../db/pool';
import { themes } from '../../db/schema/themes';
import { actorSchema, themeIdSchema, type Actor } from '../../lib/theme-status';
import { auditInsert } from '../audit';
import { AppError } from '../errors';
import { renderPublishAssets, type PublishAssetFile } from '../render/publish-assets';
import { themeAttemptPrefix, themePrefix, themeVersionPrefix } from '../storage/keys';
import { defaultStorage, type ObjectStorage } from '../storage/r2';
import { getThemeCacheTags } from './theme-cache-tags';
import { assertTransition } from './theme-status';

const publishInputSchema = z.object({
  themeId: themeIdSchema,
  actor: actorSchema,
  force: z.boolean().default(false),
});
const retentionSchema = z.object({
  themeId: themeIdSchema,
  keepFromVersion: z.number().int().nonnegative(),
});
const immutable = 'public, max-age=31536000, immutable';
type Theme = typeof themes.$inferSelect;
type Capture = Pick<Theme, 'id' | 'assetVersion' | 'status' | 'specHash'>;

export interface PublishThemeInput {
  themeId: string;
  actor: Actor;
  force?: boolean;
  storage?: ObjectStorage;
}

export interface PublishThemeResult {
  data: { assetVersion: number; skipped: boolean };
  tags: string[];
  cleanup?: { themeId: string; keepFromVersion: number };
}

function predicate(captured: Capture) {
  return and(
    eq(themes.id, captured.id),
    eq(themes.assetVersion, captured.assetVersion),
    eq(themes.status, captured.status),
    eq(themes.specHash, captured.specHash),
  );
}

function matches(theme: Theme | undefined, captured: Capture): theme is Theme {
  return (
    !!theme &&
    theme.assetVersion === captured.assetVersion &&
    theme.status === captured.status &&
    theme.specHash === captured.specHash
  );
}

function auditActor(actor: Actor): { actorId: string | null; actor: Record<string, string> } {
  return actor.kind === 'system'
    ? { actorId: null, actor: { kind: 'system', label: actor.label } }
    : { actorId: actor.userId, actor: { kind: 'user' } };
}

async function cleanAttempt(storage: ObjectStorage, prefix: string): Promise<void> {
  try {
    await storage.deletePrefix(prefix);
  } catch {
    console.error({ scope: 'theme.publish.cleanup', message: 'Attempt cleanup failed' });
  }
}

async function uploadAssets(storage: ObjectStorage, files: PublishAssetFile[]): Promise<void> {
  let next = 0;
  const failures: unknown[] = [];
  const worker = async (): Promise<void> => {
    while (failures.length === 0 && next < files.length) {
      const file = files[next++];
      if (!file) return;
      try {
        await storage.put({ ...file, cacheControl: immutable });
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
  if (failures.length > 0) throw failures[0];
}

async function recordFailure(
  captured: Capture,
  actor: Actor,
  attemptId: string,
  phase: 'render' | 'upload',
): Promise<void> {
  const who = auditActor(actor);
  try {
    await dbPool.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(themes)
        .where(eq(themes.id, captured.id))
        .for('update');
      const stale = !matches(current, captured);
      if (!stale)
        await tx
          .update(themes)
          .set({
            publishError: phase === 'render' ? 'Asset rendering failed.' : 'Asset upload failed.',
          })
          .where(predicate(captured));
      await tx.execute(
        auditInsert({
          actorId: who.actorId,
          action: 'theme.publish_failed',
          entityType: 'theme',
          entityId: captured.id,
          meta: {
            actor: who.actor,
            attemptId,
            assetVersion: captured.assetVersion + 1,
            phase,
            stale,
          },
        }),
      );
    });
  } catch {
    console.error({
      scope: 'theme.publish.failure-audit',
      message: 'Could not record the failed attempt',
    });
  }
}

export async function publishTheme(input: PublishThemeInput): Promise<PublishThemeResult> {
  const parsed = publishInputSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError('VALIDATION', 'A valid theme, actor, and force flag are required');
  const { themeId, actor, force } = parsed.data;
  if (actor.kind === 'user' && actor.role !== 'admin') throw new AppError('FORBIDDEN');
  const storage = input.storage ?? defaultStorage;
  const [loaded] = await db.select().from(themes).where(eq(themes.id, themeId));
  if (!loaded) throw new AppError('NOT_FOUND');
  if (!['approved', 'published', 'archived'].includes(loaded.status))
    throw new AppError('INVALID_STATE');
  if (loaded.status !== 'published') assertTransition(loaded, 'published', actor);
  const tags = await getThemeCacheTags(loaded);
  if (loaded.status === 'published' && loaded.assetsSpecHash === loaded.specHash && !force) {
    return {
      data: { assetVersion: loaded.assetVersion, skipped: true },
      tags,
      ...(loaded.assetVersion >= 1
        ? { cleanup: { themeId, keepFromVersion: loaded.assetVersion - 1 } }
        : {}),
    };
  }
  const captured: Capture = {
    id: loaded.id,
    assetVersion: loaded.assetVersion,
    status: loaded.status,
    specHash: loaded.specHash,
  };
  const next = captured.assetVersion + 1;
  const attemptId = randomUUID();
  const prefix = themeAttemptPrefix(themeId, next, attemptId);
  let phase: 'render' | 'upload' = 'render';
  let rendered: Awaited<ReturnType<typeof renderPublishAssets>>;
  try {
    rendered = await renderPublishAssets({
      themeId,
      assetVersion: next,
      attemptId,
      spec: loaded.spec,
      storage,
    });
    phase = 'upload';
    await uploadAssets(storage, rendered.files);
  } catch {
    await cleanAttempt(storage, prefix);
    await recordFailure(captured, actor, attemptId, phase);
    throw new AppError(
      'RENDER_FAILED',
      phase === 'render' ? 'Asset rendering failed' : 'Asset upload failed',
    );
  }

  let readyToCommit = false;
  try {
    await dbPool.transaction(async (tx) => {
      const [current] = await tx.select().from(themes).where(eq(themes.id, themeId)).for('update');
      if (!matches(current, captured))
        throw new AppError('CONFLICT', 'Theme changed while assets were rendered');
      if (current.status !== 'published') assertTransition(current, 'published', actor);
      const [updated] = await tx
        .update(themes)
        .set({
          assets: rendered.assets,
          assetVersion: next,
          assetsSpecHash: captured.specHash,
          dominantColor: rendered.dominantColor,
          colorFamily: rendered.colorFamily,
          previewHash: rendered.previewHash,
          status: 'published',
          publishedAt: sql`coalesce(${themes.publishedAt}, now())`,
          publishError: null,
        })
        .where(predicate(captured))
        .returning({ id: themes.id });
      if (!updated) throw new AppError('CONFLICT', 'Theme changed while publishing');
      const who = auditActor(actor);
      await tx.execute(
        auditInsert({
          actorId: who.actorId,
          action: 'theme.published',
          entityType: 'theme',
          entityId: themeId,
          meta: {
            actor: who.actor,
            attemptId,
            assetVersion: next,
            specHash: captured.specHash,
            before: { status: captured.status, assetVersion: captured.assetVersion },
          },
        }),
      );
      readyToCommit = true;
    });
  } catch (error) {
    // The callback completed: COMMIT may have succeeded even if its acknowledgement was lost.
    if (readyToCommit) throw new AppError('INTERNAL', 'Publication commit outcome is uncertain');
    await cleanAttempt(storage, prefix);
    if (error instanceof AppError && error.code === 'CONFLICT') throw error;
    throw new AppError('INTERNAL', 'Publication transaction failed');
  }

  return {
    data: { assetVersion: next, skipped: false },
    tags,
    cleanup: { themeId, keepFromVersion: next - 1 },
  };
}

export async function cleanupOldVersions(
  themeId: string,
  keepFromVersion: number,
  storage: ObjectStorage = defaultStorage,
): Promise<void> {
  const input = retentionSchema.safeParse({ themeId, keepFromVersion });
  if (!input.success)
    throw new AppError('VALIDATION', 'A valid theme and retention version are required');
  const [current] = await db
    .select({ assetVersion: themes.assetVersion })
    .from(themes)
    .where(eq(themes.id, input.data.themeId));
  if (!current) return;
  const cutoff = Math.min(input.data.keepFromVersion, current.assetVersion - 1);
  if (cutoff <= 1) return;
  const prefix = themePrefix(input.data.themeId);
  const children = await storage.listPrefixes(prefix);
  for (const child of children) {
    if (!child.startsWith(prefix)) continue;
    const match = /^v([1-9]\d*)\/$/.exec(child.slice(prefix.length));
    const version = Number(match?.[1]);
    if (Number.isSafeInteger(version) && version < cutoff)
      await storage.deletePrefix(themeVersionPrefix(input.data.themeId, version));
  }
}
