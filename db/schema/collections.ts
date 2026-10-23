import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { themes } from './themes';

export const collectionKind = pgEnum('collection_kind', ['editorial', 'seasonal', 'user']);
export const collectionVisibility = pgEnum('collection_visibility', [
  'public',
  'unlisted',
  'private',
]);

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').unique(), // required for editorial/seasonal, null for user
    kind: collectionKind('kind').notNull(),
    visibility: collectionVisibility('visibility').notNull().default('private'),
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'cascade' }),
    titleEn: text('title_en').notNull(),
    titleAr: text('title_ar'),
    descriptionEn: text('description_en'),
    descriptionAr: text('description_ar'),
    coverThemeId: uuid('cover_theme_id').references(() => themes.id, { onDelete: 'set null' }),
    isPinned: boolean('is_pinned').notNull().default(false), // shown on Home
    sortOrder: integer('sort_order').notNull().default(0),
    startsAt: timestamp('starts_at', { withTimezone: true }), // seasonal window
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('collections_kind_sort_idx').on(t.kind, t.sortOrder),
    index('collections_owner_idx').on(t.ownerId),
    check('collections_owner_kind_chk', sql`(${t.kind} = 'user') = (${t.ownerId} IS NOT NULL)`),
    check('collections_slug_kind_chk', sql`${t.kind} = 'user' OR ${t.slug} IS NOT NULL`),
    check(
      'collections_window_chk',
      sql`${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.startsAt} < ${t.endsAt}`,
    ),
  ],
);

export const collectionItems = pgTable(
  'collection_items',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    themeId: uuid('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.themeId] }),
    index('collection_items_order_idx').on(t.collectionId, t.position),
  ],
);
