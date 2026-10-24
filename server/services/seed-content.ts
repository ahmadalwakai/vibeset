import 'server-only';

import { icons } from '@phosphor-icons/core';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { APPS } from '../../content/apps';
import { TAXONOMY } from '../../content/taxonomy';
import { db } from '../../db/index';
import { appCategory, apps } from '../../db/schema/catalog';
import { siteSettings, auditLog } from '../../db/schema/system';
import { tags } from '../../db/schema/taxonomy';
import { CacheTags } from '../../lib/cache-tags';
import type { CatalogApp } from '../../lib/catalog';
import type { SeedTag } from '../../lib/generator';
import {
  defaultSettings,
  settingKeySchema,
  settingSchemas,
  type SettingKey,
} from '../../lib/settings';
import { actorSchema, type Actor } from '../../lib/theme-status';
import { AppError } from '../errors';

const slug = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((value) => value === value.trim());
const label = z.string().trim().min(1).max(160);
const description = z
  .string()
  .trim()
  .max(4000)
  .nullish()
  .transform((value) => value ?? null);
const tagSchema = z.object({
  slug: slug.min(2),
  kind: z.enum(['aesthetic', 'mood', 'season', 'style']),
  nameEn: label,
  nameAr: label,
  descriptionEn: description,
  descriptionAr: description,
  sortOrder: z.number().int().nonnegative().max(2_147_483_647),
});
const appSchema = z.object({
  slug,
  name: label,
  aliases: z.array(label).max(20),
  category: z.enum(appCategory.enumValues),
  glyph: z
    .string()
    .regex(/^[a-z0-9-]{1,48}$/)
    .refine((value) => value === value.trim()),
  rank: z.number().int().nonnegative().max(2_147_483_647),
});
const availableGlyphs = new Set<string>(
  icons
    .filter(
      (icon) =>
        !icon.categories.some((category: string) => category === 'brands') &&
        !icon.name.includes('-logo'),
    )
    .map(({ name }) => name),
);
const resultSchema = z.object({
  changed: z.number().int().nonnegative(),
  identifiers: z.array(z.string()),
  auditId: z.uuid().nullable(),
});

export interface SeedResult {
  data: { changed: number; identifiers: string[]; auditId: string | null };
  tags: string[];
}

function systemActor(actor: Actor): Extract<Actor, { kind: 'system' }> {
  const parsed = actorSchema.safeParse(actor);
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid seed actor');
  if (parsed.data.kind !== 'system')
    throw new AppError('FORBIDDEN', 'Seeds require a system actor');
  return parsed.data;
}

function parseRows<T>(schema: z.ZodType<T>, rows: unknown): T {
  const parsed = schema.safeParse(rows);
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid seed content');
  return parsed.data;
}

function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length)
    throw new AppError('VALIDATION', 'Seed identifiers must be unique');
}

async function commitSeed(
  statement: SQL,
  kind: 'taxonomy' | 'apps' | 'settings',
  actor: Extract<Actor, { kind: 'system' }>,
  cacheTags: string[],
): Promise<SeedResult> {
  const result = await db.execute(sql`
    WITH changed AS (${statement}), summary AS (
      SELECT count(*)::int AS changed, coalesce(jsonb_agg(identifier ORDER BY identifier), '[]'::jsonb) AS identifiers FROM changed
    ), audited AS (
      INSERT INTO ${auditLog} (actor_id, action, entity_type, meta)
      SELECT NULL, ${`${kind}.seeded`}, ${kind}, ${JSON.stringify({ actor })}::jsonb ||
        jsonb_build_object('changed', summary.changed, 'identifiers', summary.identifiers)
      FROM summary WHERE summary.changed > 0 RETURNING id
    )
    SELECT summary.changed, summary.identifiers, (SELECT id::text FROM audited) AS "auditId" FROM summary
  `);
  const data = resultSchema.parse(result.rows[0]);
  return { data, tags: cacheTags };
}

function empty(): SeedResult {
  return { data: { changed: 0, identifiers: [], auditId: null }, tags: [] };
}

export async function seedTaxonomy(input: {
  actor: Actor;
  rows?: readonly SeedTag[];
}): Promise<SeedResult> {
  const actor = systemActor(input.actor);
  const rows = parseRows(
    z.array(tagSchema).max(500),
    input.rows === undefined ? TAXONOMY : input.rows,
  );
  unique(rows.map(({ slug }) => slug));
  if (!rows.length) return empty();
  const statement = sql`
    INSERT INTO ${tags} (slug, kind, name_en, name_ar, description_en, description_ar, sort_order)
    SELECT s.slug, s.kind::tag_kind, s."nameEn", s."nameAr", s."descriptionEn", s."descriptionAr", s."sortOrder"
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS s(slug text, kind text, "nameEn" text, "nameAr" text, "descriptionEn" text, "descriptionAr" text, "sortOrder" int)
    ORDER BY s.slug
    ON CONFLICT (slug) DO UPDATE SET
      kind = EXCLUDED.kind, name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar,
      description_en = EXCLUDED.description_en, description_ar = EXCLUDED.description_ar,
      sort_order = EXCLUDED.sort_order, updated_at = now()
    WHERE (${tags.kind}, ${tags.nameEn}, ${tags.nameAr}, ${tags.descriptionEn}, ${tags.descriptionAr}, ${tags.sortOrder})
      IS DISTINCT FROM (EXCLUDED.kind, EXCLUDED.name_en, EXCLUDED.name_ar, EXCLUDED.description_en, EXCLUDED.description_ar, EXCLUDED.sort_order)
    RETURNING slug AS identifier
  `;
  return commitSeed(statement, 'taxonomy', actor, [CacheTags.taxonomy, CacheTags.themes]);
}

export async function seedApps(input: {
  actor: Actor;
  rows?: readonly CatalogApp[];
}): Promise<SeedResult> {
  const actor = systemActor(input.actor);
  const rows = parseRows(z.array(appSchema).max(500), input.rows === undefined ? APPS : input.rows);
  unique(rows.map(({ slug }) => slug));
  const missing = [
    ...new Set(rows.map(({ glyph }) => glyph).filter((glyph) => !availableGlyphs.has(glyph))),
  ].sort();
  if (missing.length)
    throw new AppError('VALIDATION', `Missing or excluded app glyphs: ${missing.join(', ')}`);
  if (!rows.length) return empty();
  const statement = sql`
    INSERT INTO ${apps} (slug, name, aliases, category, glyph, rank)
    SELECT s.slug, s.name, s.aliases, s.category::app_category, s.glyph, s.rank
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS s(slug text, name text, aliases text[], category text, glyph text, rank int)
    ORDER BY s.slug
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, aliases = EXCLUDED.aliases, category = EXCLUDED.category,
      glyph = EXCLUDED.glyph, rank = EXCLUDED.rank, updated_at = now()
    WHERE (${apps.name}, ${apps.aliases}, ${apps.category}, ${apps.glyph}, ${apps.rank})
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.aliases, EXCLUDED.category, EXCLUDED.glyph, EXCLUDED.rank)
    RETURNING slug AS identifier
  `;
  return commitSeed(statement, 'apps', actor, [CacheTags.apps]);
}

export async function seedSettings(input: {
  actor: Actor;
  keys?: readonly SettingKey[];
}): Promise<SeedResult> {
  const actor = systemActor(input.actor);
  const keys = parseRows(
    z.array(settingKeySchema).max(3),
    input.keys === undefined ? Object.keys(defaultSettings) : input.keys,
  );
  unique(keys);
  if (!keys.length) return empty();
  const rows = keys.map((key) => ({ key, value: settingSchemas[key].parse(defaultSettings[key]) }));
  const statement = sql`
    INSERT INTO ${siteSettings} (key, value)
    SELECT s.key, s.value FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS s(key text, value jsonb)
    ORDER BY s.key ON CONFLICT (key) DO NOTHING RETURNING key AS identifier
  `;
  return commitSeed(statement, 'settings', actor, [CacheTags.settings]);
}
