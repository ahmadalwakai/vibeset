import 'server-only';

import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index';
import { themes } from '../../db/schema/themes';

// Called only by Better Auth's authenticated delete-user hook, before its FK cascades.
export async function cleanupUserContent(userId: string): Promise<void> {
  const id = z.string().min(1).parse(userId);
  await db.delete(themes).where(and(eq(themes.ownerId, id), ne(themes.status, 'published')));
}
