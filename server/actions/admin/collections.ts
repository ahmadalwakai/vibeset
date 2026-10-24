'use server';
import type { ActionResult } from '../../../lib/result';
import type { AdminPage } from '../../../lib/admin';
import type { AdminCollectionPage, AdminThemeChoice } from '../../../lib/admin-content';
import { adminContentAction } from '../../admin-content-action';
import {
  adminUpsertCollectionSchema,
  adminContentIdSchema,
  adminSetPinnedSchema,
  adminReorderCollectionSchema,
  adminCollectionItemSchema,
  adminCollectionListSchema,
  adminPublishedPickerSchema,
} from '../../../lib/validation/admin-content';

export async function adminUpsertCollection(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return adminContentAction(raw, adminUpsertCollectionSchema, async (value, actor) =>
    (await import('../../services/admin-collections')).adminUpsertCollection(value, actor),
  );
}
export async function adminDeleteCollection(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return adminContentAction(raw, adminContentIdSchema, async (value, actor) =>
    (await import('../../services/admin-collections')).adminDeleteCollection(value, actor),
  );
}
export async function adminSetPinned(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return adminContentAction(raw, adminSetPinnedSchema, async (value, actor) =>
    (await import('../../services/admin-collections')).adminSetPinned(value, actor),
  );
}
export async function adminReorderCollection(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  return adminContentAction(raw, adminReorderCollectionSchema, async (value, actor) =>
    (await import('../../services/admin-collections')).adminReorderCollection(value, actor),
  );
}
export async function adminRemoveCollectionItem(
  raw: unknown,
): Promise<ActionResult<{ itemCount: number }>> {
  return adminContentAction(raw, adminCollectionItemSchema, async (value, actor) =>
    (await import('../../services/admin-collections')).adminRemoveCollectionItem(value, actor),
  );
}
export async function refreshAdminCollections(
  raw: unknown,
): Promise<ActionResult<AdminCollectionPage>> {
  return adminContentAction(raw, adminCollectionListSchema, async (value) => ({
    data: await (await import('../../admin-queries/content')).listAdminCollections(value),
    tags: [],
  }));
}
export async function searchAdminPublishedThemes(
  raw: unknown,
): Promise<ActionResult<AdminPage<AdminThemeChoice>>> {
  return adminContentAction(raw, adminPublishedPickerSchema, async (value) => ({
    data: await (await import('../../admin-queries/content')).searchAdminPublishedThemes(value),
    tags: [],
  }));
}
