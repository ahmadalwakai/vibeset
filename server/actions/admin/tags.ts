'use server';
import type { ActionResult } from '../../../lib/result';
import type { AdminContentTag } from '../../../lib/admin-content';
import { adminContentAction } from '../../admin-content-action';
import {
  adminUpsertTagSchema,
  adminDeleteTagSchema,
  adminMergeTagsSchema,
  adminTagListSchema,
} from '../../../lib/validation/admin-content';
export async function adminUpsertTag(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return adminContentAction(raw, adminUpsertTagSchema, async (value, actor) =>
    (await import('../../services/admin-tags')).adminUpsertTag(value, actor),
  );
}
export async function adminDeleteTag(
  raw: unknown,
): Promise<ActionResult<{ id: string; affectedThemes: number }>> {
  return adminContentAction(raw, adminDeleteTagSchema, async (value, actor) =>
    (await import('../../services/admin-tags')).adminDeleteTag(value, actor),
  );
}
export async function adminMergeTags(
  raw: unknown,
): Promise<ActionResult<{ id: string; affectedThemes: number }>> {
  return adminContentAction(raw, adminMergeTagsSchema, async (value, actor) =>
    (await import('../../services/admin-tags')).adminMergeTags(value, actor),
  );
}
export async function refreshAdminTags(raw: unknown): Promise<ActionResult<AdminContentTag[]>> {
  return adminContentAction(raw, adminTagListSchema, async (value) => ({
    data: await (await import('../../admin-queries/content')).listAdminTags(value),
    tags: [],
  }));
}
