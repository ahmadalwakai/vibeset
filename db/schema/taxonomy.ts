import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { themes } from './themes';

export const tagKind = pgEnum('tag_kind', ['aesthetic', 'style', 'mood', 'season']);
// Colour filtering uses themes.color_family — there are no colour tags.

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(), // ^[a-z0-9-]{2,40}$
    kind: tagKind('kind').notNull(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
    descriptionEn: text('description_en'),
    descriptionAr: text('description_ar'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('tags_kind_sort_idx').on(t.kind, t.sortOrder)],
);

export const themeTags = pgTable(
  'theme_tags',
  {
    themeId: uuid('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.themeId, t.tagId] }), index('theme_tags_tag_idx').on(t.tagId)],
);
