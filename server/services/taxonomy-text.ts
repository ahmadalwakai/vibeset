import 'server-only';
import { sql } from 'drizzle-orm';
import type { AdminTransaction } from './admin-access';

/** Caller holds the exclusive taxonomy guard. Memberships and search text commit together. */
export async function rebuildTaxonomyText(
  tx: AdminTransaction,
  ids: readonly string[],
): Promise<void> {
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    if (!batch.length) continue;
    await tx.execute(sql`WITH desired AS (
      SELECT t.id,coalesce((SELECT string_agg(tag.slug||' '||tag.name_en||' '||tag.name_ar,' ' ORDER BY tag.kind,tag.sort_order,tag.slug)
        FROM theme_tags tt JOIN tags tag ON tag.id=tt.tag_id WHERE tt.theme_id=t.id),'') AS text
      FROM themes t WHERE t.id IN (${sql.join(
        batch.map((id) => sql`${id}::uuid`),
        sql`,`,
      )})
    ) UPDATE themes t SET tags_text=desired.text,updated_at=now() FROM desired WHERE t.id=desired.id AND t.tags_text IS DISTINCT FROM desired.text`);
  }
}
