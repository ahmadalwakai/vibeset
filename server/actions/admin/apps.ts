'use server';
import { z } from 'zod';
import type { ActionResult } from '../../../lib/result';
import type { AdminAppPage } from '../../../lib/admin-content';
import { adminContentAction } from '../../admin-content-action';
import {
  adminUpsertAppSchema,
  adminContentIdSchema,
  adminReorderAppsSchema,
  adminAppListSchema,
} from '../../../lib/validation/admin-content';
export async function adminUpsertApp(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return adminContentAction(raw, adminUpsertAppSchema, async (value, actor) =>
    (await import('../../services/admin-apps')).adminUpsertApp(value, actor),
  );
}
export async function adminDeleteApp(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return adminContentAction(raw, adminContentIdSchema, async (value, actor) =>
    (await import('../../services/admin-apps')).adminDeleteApp(value, actor),
  );
}
export async function adminReorderApps(raw: unknown): Promise<ActionResult<{ count: number }>> {
  return adminContentAction(raw, adminReorderAppsSchema, async (value, actor) =>
    (await import('../../services/admin-apps')).adminReorderApps(value, actor),
  );
}
export async function refreshAdminApps(raw: unknown): Promise<ActionResult<AdminAppPage>> {
  return adminContentAction(raw, adminAppListSchema, async (value) => ({
    data: await (await import('../../admin-queries/content')).listAdminApps(value),
    tags: [],
  }));
}
export async function getAdminAppOrder(): Promise<
  ActionResult<{ id: string; slug: string; rank: number }[]>
> {
  return adminContentAction({}, z.strictObject({}), async () => ({
    data: await (await import('../../admin-queries/content')).listAdminAppOrder(),
    tags: [],
  }));
}
