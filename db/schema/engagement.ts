import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { themes } from './themes';

export const favorites = pgTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    themeId: uuid('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.themeId] }),
    index('favorites_theme_idx').on(t.themeId),
    index('favorites_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
);

export const themeStatsDaily = pgTable(
  'theme_stats_daily',
  {
    themeId: uuid('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(), // UTC date 'YYYY-MM-DD'
    views: integer('views').notNull().default(0),
    downloads: integer('downloads').notNull().default(0),
    iconExports: integer('icon_exports').notNull().default(0),
    remixes: integer('remixes').notNull().default(0),
    setupCompletions: integer('setup_completions').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.themeId, t.day] }), index('theme_stats_day_idx').on(t.day)],
);
