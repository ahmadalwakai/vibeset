import { sql, type SQL } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { generationRuns } from './system';
import { tsvector } from '../custom-types';
import type { ThemeSpec } from '@/lib/render/spec';
import type { ThemeAssets } from '@/lib/theme-assets';

export const themeStatus = pgEnum('theme_status', [
  'draft',
  'pending_review',
  'approved',
  'published',
  'rejected',
  'archived',
]);
export const themeSource = pgEnum('theme_source', ['generated', 'admin', 'creator', 'remix']);
export const colorFamily = pgEnum('color_family', [
  'pink',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'brown',
  'black',
  'white',
  'gray',
  'multi',
]);

export const themes = pgTable(
  'themes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    status: themeStatus('status').notNull().default('draft'),
    source: themeSource('source').notNull(),
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
    remixOfId: uuid('remix_of_id').references((): AnyPgColumn => themes.id, {
      onDelete: 'set null',
    }),

    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar'),
    descriptionEn: text('description_en'),
    descriptionAr: text('description_ar'),

    spec: jsonb('spec').$type<ThemeSpec>().notNull(),
    specHash: text('spec_hash').notNull(), // sha256 of canonical spec JSON
    assetVersion: integer('asset_version').notNull().default(0),
    assets: jsonb('assets').$type<ThemeAssets>(), // null until first publish
    assetsSpecHash: text('assets_spec_hash'), // specHash the assets were rendered from
    dominantColor: text('dominant_color'),
    colorFamily: colorFamily('color_family'),
    previewHash: text('preview_hash'), // 64-bit dHash of the 72×156 home wallpaper, docs/05 §8

    tagsText: text('tags_text').notNull().default(''), // "y2k Y2K واي تو كي pastel …" — maintained by services
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('simple', coalesce(${themes.nameEn}, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(${themes.nameAr}, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(${themes.tagsText}, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(${themes.descriptionEn}, '')), 'C')`,
    ),

    isFeatured: boolean('is_featured').notNull().default(false),
    downloadCount: integer('download_count').notNull().default(0),
    favoriteCount: integer('favorite_count').notNull().default(0),
    popularity: doublePrecision('popularity').notNull().default(0),

    rejectionReason: text('rejection_reason'),
    publishError: text('publish_error'),
    generationRunId: uuid('generation_run_id').references(() => generationRuns.id, {
      onDelete: 'set null',
    }),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('themes_pub_new_idx')
      .on(t.publishedAt.desc(), t.id.desc())
      .where(sql`${t.status} = 'published'`),
    index('themes_pub_popular_idx')
      .on(t.popularity.desc(), t.id.desc())
      .where(sql`${t.status} = 'published'`),
    index('themes_pub_downloads_idx')
      .on(t.downloadCount.desc(), t.id.desc())
      .where(sql`${t.status} = 'published'`),
    index('themes_status_idx').on(t.status, t.updatedAt.desc()),
    index('themes_owner_idx').on(t.ownerId),
    index('themes_color_family_idx').on(t.colorFamily),
    index('themes_generation_run_idx').on(t.generationRunId),
    index('themes_search_idx').using('gin', t.searchVector),
  ],
);
