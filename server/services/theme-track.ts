import 'server-only';

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index';
import { trackInputSchema, type TrackInput } from '../../lib/validation/track';
import { AppError } from '../errors';

/** Anonymous aggregates only; the published-row lock serializes counting with archival. */
export async function trackThemeEvent(input: TrackInput): Promise<{
  data: { counted: boolean };
  tags: string[];
}> {
  const parsed = trackInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid tracking event');
  const { themeId, event } = parsed.data;
  const result = await db.execute(sql`
    WITH published AS MATERIALIZED (
      SELECT id FROM themes WHERE id = ${themeId}::uuid AND status = 'published' FOR UPDATE
    ), daily AS (
      INSERT INTO theme_stats_daily (theme_id, day, views, downloads, icon_exports, remixes, setup_completions)
      SELECT id, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
        ${event === 'view' ? 1 : 0}, ${event === 'download' ? 1 : 0},
        ${event === 'icon_export' ? 1 : 0}, ${event === 'remix' ? 1 : 0},
        ${event === 'setup_complete' ? 1 : 0}
      FROM published
      ON CONFLICT (theme_id, day) DO UPDATE SET
        views = theme_stats_daily.views + excluded.views,
        downloads = theme_stats_daily.downloads + excluded.downloads,
        icon_exports = theme_stats_daily.icon_exports + excluded.icon_exports,
        remixes = theme_stats_daily.remixes + excluded.remixes,
        setup_completions = theme_stats_daily.setup_completions + excluded.setup_completions
      RETURNING theme_id
    ), download_total AS (
      UPDATE themes SET download_count = download_count + 1
      WHERE id IN (SELECT id FROM published) AND ${event} = 'download'
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM daily) AS counted
  `);
  const data = z.object({ counted: z.boolean() }).parse(result.rows[0]);
  // Public counters are cached until their normal revalidation/cron refresh.
  return { data, tags: [] };
}
