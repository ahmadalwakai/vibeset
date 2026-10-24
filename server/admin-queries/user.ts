import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { themes } from '../../db/schema/themes';
import type { AccountProfile, SavedRemix } from '../../lib/account';
import type { Paginated } from '../../lib/dto';
import { decodeCursor, encodeCursor } from '../../lib/utils/cursor';
import { listRemixesSchema } from '../../lib/validation/account';
import { savedRemixSchema } from '../../lib/validation/saved-remixes';
import { requireUser } from '../guards';

export async function getAccountProfile(): Promise<AccountProfile> {
  const session = await requireUser();
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    locale: session.user.locale === 'ar' ? 'ar' : 'en',
  };
}

const columns = {
  id: themes.id,
  nameEn: themes.nameEn,
  spec: themes.spec,
  updatedAt: themes.updatedAt,
  createdAt: themes.createdAt,
  cursorTime: sql<string>`to_char(${themes.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};
function mapRemix(row: {
  id: string;
  nameEn: string;
  spec: unknown;
  updatedAt: Date;
  createdAt: Date;
}): SavedRemix {
  return savedRemixSchema.parse({
    id: row.id,
    nameEn: row.nameEn,
    spec: row.spec,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

export async function listMyRemixes(
  input: { cursor?: string } = {},
): Promise<Paginated<SavedRemix>> {
  const session = await requireUser();
  const parsed = listRemixesSchema.parse(input);
  const cursor = parsed.cursor ? decodeCursor(parsed.cursor, 'new') : null;
  const { db } = await import('../../db');
  const rows = await db
    .select(columns)
    .from(themes)
    .where(
      and(
        eq(themes.ownerId, session.user.id),
        eq(themes.source, 'remix'),
        eq(themes.status, 'draft'),
        cursor
          ? sql`(${themes.createdAt}, ${themes.id}) < (${cursor.s}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(themes.createdAt), desc(themes.id))
    .limit(49);
  const page = rows.slice(0, 48);
  const last = page.at(-1);
  return {
    items: page.map(mapRemix),
    nextCursor:
      rows.length > 48 && last ? encodeCursor({ k: 'new', s: last.cursorTime, id: last.id }) : null,
  };
}

export async function getMyRemix(id: string): Promise<SavedRemix | null> {
  const session = await requireUser();
  const validId = z.uuid().toLowerCase().parse(id);
  const { db } = await import('../../db');
  const [row] = await db
    .select(columns)
    .from(themes)
    .where(
      and(
        eq(themes.id, validId),
        eq(themes.ownerId, session.user.id),
        eq(themes.source, 'remix'),
        eq(themes.status, 'draft'),
      ),
    )
    .limit(1);
  return row ? mapRemix(row) : null;
}
