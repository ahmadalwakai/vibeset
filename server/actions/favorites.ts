'use server';

import type { FavoriteMergeData, FavoriteToggleData } from '../../lib/favorites';
import type { ActionResult } from '../../lib/result';
import { mergeLocalFavoritesSchema, toggleFavoriteSchema } from '../../lib/validation/favorites';

export async function toggleFavorite(raw: unknown): Promise<ActionResult<FavoriteToggleData>> {
  const { createAction } = await import('../action');
  return createAction({
    input: toggleFavoriteSchema,
    auth: 'user',
    rateLimit: {
      key: (context) => `favorite-toggle:${context.user.id}`,
      limit: 120,
      windowSec: 60,
    },
    handler: async (input, context) => {
      const service = await import('../services/favorites');
      return (await service.toggleFavorite(context.user.id, input.themeId)).data;
    },
  })(raw);
}

export async function mergeLocalFavorites(raw: unknown): Promise<ActionResult<FavoriteMergeData>> {
  const { createAction } = await import('../action');
  return createAction({
    input: mergeLocalFavoritesSchema,
    auth: 'user',
    rateLimit: {
      key: (context) => `favorite-merge:${context.user.id}`,
      limit: 10,
      windowSec: 3600,
    },
    handler: async (input, context) => {
      const service = await import('../services/favorites');
      return (await service.mergeLocalFavorites(context.user.id, input.themeIds)).data;
    },
  })(raw);
}
