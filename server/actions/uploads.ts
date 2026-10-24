'use server';

import type { ActionContext } from '../../lib/auth';
import type { ActionResult } from '../../lib/result';
import type { Actor } from '../../lib/theme-status';
import type { UploadReservation, FinalizedWallpaperUpload, UploadedAsset } from '../../lib/uploads';
import { createUploadSchema, finalizeUploadSchema } from '../../lib/validation/uploads';

function actor(context: ActionContext<'creator'>): Actor {
  return {
    kind: 'user',
    userId: context.user.id,
    role: context.user.role === 'admin' ? 'admin' : 'user',
    isCreator: context.creator?.status === 'approved',
  };
}
const uploadBudget = {
  key: (context: ActionContext<'creator'>): string => `creator-upload:${context.user.id}`,
  limit: 20,
  windowSec: 3600,
};
export async function createWallpaperUpload(
  raw: unknown,
): Promise<ActionResult<UploadReservation>> {
  const { createAction } = await import('../action');
  return createAction({
    input: createUploadSchema,
    auth: 'creator',
    feature: 'uploadsEnabled',
    rateLimit: uploadBudget,
    handler: async (input, context) => {
      const service = await import('../services/uploads');
      return (await service.createWallpaperUpload(input, actor(context))).data;
    },
  })(raw);
}
export async function createAvatarUpload(raw: unknown): Promise<ActionResult<UploadReservation>> {
  const { createAction } = await import('../action');
  return createAction({
    input: createUploadSchema,
    auth: 'creator',
    feature: 'uploadsEnabled',
    rateLimit: uploadBudget,
    handler: async (input, context) => {
      const service = await import('../services/uploads');
      return (await service.createAvatarUpload(input, actor(context))).data;
    },
  })(raw);
}
export async function finalizeWallpaperUpload(
  raw: unknown,
): Promise<ActionResult<FinalizedWallpaperUpload>> {
  const { createAction } = await import('../action');
  return createAction({
    input: finalizeUploadSchema,
    auth: 'creator',
    feature: 'uploadsEnabled',
    handler: async (input, context) => {
      const service = await import('../services/uploads');
      return (await service.finalizeWallpaperUpload(input, actor(context))).data;
    },
  })(raw);
}
export async function finalizeAvatarUpload(raw: unknown): Promise<ActionResult<UploadedAsset>> {
  const { createAction } = await import('../action');
  return createAction({
    input: finalizeUploadSchema,
    auth: 'creator',
    feature: 'uploadsEnabled',
    handler: async (input, context) => {
      const service = await import('../services/uploads');
      return (await service.finalizeAvatarUpload(input, actor(context))).data;
    },
  })(raw);
}
