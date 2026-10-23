import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const appCategory = pgEnum('app_category', [
  'social',
  'messaging',
  'media',
  'music',
  'photo',
  'productivity',
  'ai',
  'shopping',
  'finance',
  'travel',
  'food',
  'health',
  'education',
  'games',
  'utilities',
  'system',
  'news',
  'lifestyle',
]);

export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(), // label shown under the icon (brand name as text only)
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    category: appCategory('category').notNull(),
    glyph: text('glyph').notNull(), // Phosphor glyph name, must exist in manifest
    iosScheme: text('ios_scheme'), // optional, verified only
    androidPackage: text('android_package'), // optional
    rank: integer('rank').notNull().default(1000), // lower = more popular (default selection = top 24)
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('apps_active_rank_idx').on(t.isActive, t.rank)],
);
