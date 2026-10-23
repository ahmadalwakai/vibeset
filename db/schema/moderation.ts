import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { themes } from './themes';

export const reportReason = pgEnum('report_reason', [
  'copyright',
  'inappropriate',
  'broken',
  'spam',
  'other',
]);
export const reportStatus = pgEnum('report_status', ['open', 'resolved', 'dismissed']);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    themeId: uuid('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    reporterId: text('reporter_id').references(() => user.id, { onDelete: 'set null' }),
    reporterIpHash: text('reporter_ip_hash'),
    reason: reportReason('reason').notNull(),
    details: text('details'), // ≤ 1000 chars
    status: reportStatus('status').notNull().default('open'),
    resolutionNote: text('resolution_note'),
    resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_status_created_idx').on(t.status, t.createdAt.desc()),
    index('reports_theme_idx').on(t.themeId),
  ],
);

export const creatorStatus = pgEnum('creator_status', [
  'pending',
  'approved',
  'rejected',
  'suspended',
]);

export const creatorProfiles = pgTable(
  'creator_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    handle: text('handle').notNull().unique(), // lowercase ^[a-z0-9_]{3,24}$
    displayName: text('display_name').notNull(),
    bio: text('bio'), // ≤ 280 chars
    avatarKey: text('avatar_key'),
    links: jsonb('links')
      .$type<{ label: string; url: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: creatorStatus('status').notNull().default('pending'),
    isAdult: boolean('is_adult').notNull(), // confirmed 18+ at application
    rejectionReason: text('rejection_reason'),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('creator_profiles_status_idx').on(t.status)],
);
