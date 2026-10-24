import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { apps } from '../../db/schema/catalog';
import { CacheTags } from '../../lib/cache-tags';
import type { Actor } from '../../lib/theme-status';
import {
  adminUpsertAppSchema,
  adminContentIdSchema,
  adminReorderAppsSchema,
  type AdminUpsertAppInput,
} from '../../lib/validation/admin-content';
import { loadGeneratorManifest } from '../render/generator-preview';
import { AppError } from '../errors';
import { contentTransaction, logContent, parseContent } from './admin-content-common';
import { lockAppCatalog, assertAppCatalogCapacity } from './app-catalog-lock';

export async function adminUpsertApp(
  input: AdminUpsertAppInput,
  actor: Actor,
): Promise<{ data: { id: string }; tags: string[] }> {
  const value = parseContent(adminUpsertAppSchema, input);
  return contentTransaction(actor, async (tx, admin) => {
    if (!(await loadGeneratorManifest()).has(value.glyph))
      throw new AppError('VALIDATION', 'Unknown glyph', { glyph: ['invalid'] });
    await lockAppCatalog(tx);
    const [before] = value.id
      ? await tx.select().from(apps).where(eq(apps.id, value.id)).for('update')
      : [];
    if (value.id && !before) throw new AppError('NOT_FOUND');
    if (value.isActive && !before?.isActive) await assertAppCatalogCapacity(tx, 1);
    const { id: requested, ...fields } = value;
    let id = requested;
    if (before) {
      if (
        Object.entries(fields).some(
          ([key, next]) => JSON.stringify(Reflect.get(before, key)) !== JSON.stringify(next),
        )
      ) {
        await tx.update(apps).set(fields).where(eq(apps.id, before.id));
        await logContent(tx, admin, 'app.updated', 'app', before.id, {
          before: {
            slug: before.slug,
            name: before.name,
            glyph: before.glyph,
            rank: before.rank,
            isActive: before.isActive,
          },
          after: fields,
        });
      }
    } else {
      const [created] = await tx.insert(apps).values(fields).returning({ id: apps.id });
      if (!created) throw new AppError('INTERNAL');
      id = created.id;
      await logContent(tx, admin, 'app.created', 'app', id, { after: fields });
    }
    if (!id) throw new AppError('INTERNAL');
    return { data: { id }, tags: [CacheTags.apps] };
  });
}
export async function adminDeleteApp(
  input: { id: string },
  actor: Actor,
): Promise<{ data: { id: string }; tags: string[] }> {
  const value = parseContent(adminContentIdSchema, input);
  return contentTransaction(actor, async (tx, admin) => {
    await lockAppCatalog(tx);
    const [row] = await tx.select().from(apps).where(eq(apps.id, value.id)).for('update');
    if (!row) throw new AppError('NOT_FOUND');
    await tx.delete(apps).where(eq(apps.id, row.id));
    await logContent(tx, admin, 'app.deleted', 'app', row.id, { slug: row.slug });
    return { data: { id: row.id }, tags: [CacheTags.apps] };
  });
}
export async function adminReorderApps(
  input: { ids: string[] },
  actor: Actor,
): Promise<{ data: { count: number }; tags: string[] }> {
  const value = parseContent(adminReorderAppsSchema, input);
  return contentTransaction(actor, async (tx, admin) => {
    await lockAppCatalog(tx);
    const rows = await tx
      .select({ id: apps.id, rank: apps.rank })
      .from(apps)
      .where(eq(apps.isActive, true))
      .orderBy(asc(apps.id))
      .for('update');
    if (rows.length !== value.ids.length || rows.some((row) => !value.ids.includes(row.id)))
      throw new AppError('CONFLICT');
    if (!value.ids.length) return { data: { count: 0 }, tags: [CacheTags.apps] };
    const changed = await tx.execute(
      sql`UPDATE ${apps} app SET rank=desired.rank,updated_at=now() FROM (VALUES ${sql.join(
        value.ids.map((id, index) => sql`(${id}::uuid,${index + 1}::int)`),
        sql`,`,
      )}) desired(id,rank) WHERE app.id=desired.id AND app.rank IS DISTINCT FROM desired.rank RETURNING app.id`,
    );
    if (changed.rows.length)
      await logContent(tx, admin, 'app.updated', 'app', value.ids[0] ?? '', {
        operation: 'reorder',
        ids: value.ids,
      });
    return { data: { count: changed.rows.length }, tags: [CacheTags.apps] };
  });
}
