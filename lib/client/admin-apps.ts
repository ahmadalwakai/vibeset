import type { ActionResult } from '../result';
import {
  adminUpsertApp,
  adminDeleteApp,
  adminReorderApps,
  getAdminAppOrder,
} from '../../server/actions/admin/apps';
import { invalidateAppCatalog } from './app-catalog';

/** Public catalogue invalidation survives an editor/account unmount after the write. */
export async function saveAdminApp(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const result = await adminUpsertApp(raw);
  if (result.ok) invalidateAppCatalog();
  return result;
}
export async function deleteAdminApp(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const result = await adminDeleteApp(raw);
  if (result.ok) invalidateAppCatalog();
  return result;
}
/** Do not begin a second RPC after this account's UI has been abandoned. */
export async function moveAdminAppToFront(
  id: string,
  signal: AbortSignal,
): Promise<ActionResult<{ count: number }> | null> {
  if (signal.aborted) return null;
  const order = await getAdminAppOrder();
  if (signal.aborted) return null;
  if (!order.ok) return order;
  const result = await adminReorderApps({
    ids: [id, ...order.data.filter((row) => row.id !== id).map((row) => row.id)],
  });
  if (result.ok) invalidateAppCatalog();
  return signal.aborted ? null : result;
}
