import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const generationRunStatus = pgEnum('generation_run_status', [
  'running',
  'completed',
  'failed',
]);
export const uploadStatus = pgEnum('upload_status', ['pending', 'ready', 'rejected']);

export const generationRuns = pgTable('generation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  aesthetic: text('aesthetic').notNull(), // aesthetic tag slug
  seed: integer('seed').notNull(),
  requested: integer('requested').notNull(),
  created: integer('created').notNull().default(0),
  skippedDuplicates: integer('skipped_duplicates').notNull().default(0),
  skippedQa: integer('skipped_qa').notNull().default(0),
  status: generationRunStatus('status').notNull().default('running'),
  log: jsonb('log')
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: uploadStatus('status').notNull().default('pending'),
    incomingKey: text('incoming_key').notNull(),
    fullKey: text('full_key'),
    previewKey: text('preview_key'),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes'),
    width: integer('width'),
    height: integer('height'),
    palette: jsonb('palette').$type<string[]>(),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('uploads_owner_idx').on(t.ownerId, t.createdAt.desc())],
);

export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(), // see §6
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // e.g. 'theme.status.approved', 'user.role.set'
    entityType: text('entity_type').notNull(), // 'theme' | 'collection' | 'user' | …
    entityId: text('entity_id'),
    meta: jsonb('meta')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entityType, t.entityId),
    index('audit_created_idx').on(t.createdAt.desc()),
    index('audit_actor_idx').on(t.actorId),
  ],
);

export const appRateLimits = pgTable('app_rate_limits', {
  key: text('key').primaryKey(), // e.g. 'track:{ipHash}', 'report:{userOrIp}'
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
});
