'use server';

import type { z } from 'zod';
import type { UserCollectionSummary } from '../../lib/collections';
import type { ActionResult } from '../../lib/result';
import type { Actor } from '../../lib/theme-status';
import {
  createCollectionSchema,
  updateCollectionSchema,
  deleteCollectionSchema,
  collectionItemSchema,
  reorderCollectionSchema,
  listCollectionsSchema,
} from '../../lib/validation/collections';

async function mutate<Schema extends z.ZodType, Data>(
  raw: unknown,
  input: Schema,
  call: (value: z.output<Schema>, actor: Actor) => Promise<{ data: Data; tags: string[] }>,
  budget?: 'create' | 'items',
): Promise<ActionResult<Data>> {
  const { createAction } = await import('../action');
  return createAction<Schema, 'user', Data>({
    input,
    auth: 'user',
    ...(budget
      ? {
          rateLimit: {
            key: ({ user }): string => `collections-${budget}:${user.id}`,
            limit: budget === 'create' ? 30 : 300,
            windowSec: 3600,
          },
        }
      : {}),
    handler: async (value, { user }) => {
      const result = await call(value, {
        kind: 'user',
        userId: user.id,
        role: user.role === 'admin' ? 'admin' : 'user',
        isCreator: false,
      });
      if (result.tags.length) {
        const { invalidate } = await import('../cache');
        invalidate(result.tags, 'update');
      }
      return result.data;
    },
  })(raw);
}
export async function createCollection(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return mutate(
    raw,
    createCollectionSchema,
    async (input, actor) =>
      (await import('../services/collections')).createCollection(input, actor),
    'create',
  );
}
export async function updateCollection(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return mutate(raw, updateCollectionSchema, async (input, actor) =>
    (await import('../services/collections')).updateCollection(input, actor),
  );
}
export async function deleteCollection(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return mutate(raw, deleteCollectionSchema, async (input, actor) =>
    (await import('../services/collections')).deleteCollection(input, actor),
  );
}
export async function addToCollection(raw: unknown): Promise<ActionResult<{ itemCount: number }>> {
  return mutate(
    raw,
    collectionItemSchema,
    async (input, actor) => (await import('../services/collections')).addToCollection(input, actor),
    'items',
  );
}
export async function removeFromCollection(
  raw: unknown,
): Promise<ActionResult<{ itemCount: number }>> {
  return mutate(
    raw,
    collectionItemSchema,
    async (input, actor) =>
      (await import('../services/collections')).removeFromCollection(input, actor),
    'items',
  );
}
export async function reorderCollection(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  return mutate(raw, reorderCollectionSchema, async (input, actor) =>
    (await import('../services/collections')).reorderCollection(input, actor),
  );
}
export async function listCollections(
  raw: unknown,
): Promise<ActionResult<{ collections: UserCollectionSummary[] }>> {
  const { createAction } = await import('../action');
  return createAction({
    input: listCollectionsSchema,
    auth: 'user',
    handler: async ({ themeId }) => ({
      collections: await (await import('../admin-queries/collections')).listMyCollections(themeId),
    }),
  })(raw);
}
