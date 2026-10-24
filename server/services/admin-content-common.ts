import 'server-only';
import { z } from 'zod';
import { dbPool } from '../../db/pool';
import type { Actor } from '../../lib/theme-status';
import { auditInsert } from '../audit';
import { AppError } from '../errors';
import { requireAdminPrincipal, type AdminPrincipal, type AdminTransaction } from './admin-access';
import { lockTaxonomy } from './taxonomy-lock';

export function parseContent<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      'VALIDATION',
      'Invalid content',
      Object.fromEntries(
        Object.entries(z.flattenError(result.error).fieldErrors).filter(
          (entry): entry is [string, string[]] => Array.isArray(entry[1]),
        ),
      ),
    );
  return result.data;
}
export async function contentTransaction<T>(
  actor: Actor,
  fn: (tx: AdminTransaction, admin: AdminPrincipal) => Promise<T>,
  taxonomy?: 'shared' | 'exclusive',
): Promise<T> {
  try {
    return await dbPool.transaction(async (tx) => {
      if (taxonomy) await lockTaxonomy(tx, taxonomy);
      const admin = await requireAdminPrincipal(tx, actor);
      return fn(tx, admin);
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === '23505') throw new AppError('CONFLICT');
    throw error;
  }
}
export async function logContent(
  tx: AdminTransaction,
  admin: AdminPrincipal,
  action: string,
  entityType: string,
  entityId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const value = z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify(meta)));
  await tx.execute(
    auditInsert({ actorId: admin.userId, action, entityType, entityId, meta: value }),
  );
}
