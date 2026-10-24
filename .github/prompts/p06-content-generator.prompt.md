---
description: 'P06 · Content & generator — palettes, 40 aesthetic recipes, spec builder, QA, duplicate detection, seeds, CLI'
agent: 'agent'
---

# P06 · Content & generator (hundreds of themes)

Read first: [content pipeline — all sections](../../docs/05-content-pipeline.md) · [data model §3, §5](../../docs/02-data-model.md) · [database rules](../instructions/database.instructions.md)

## Goal

Run one command and get hundreds of good-looking, de-duplicated, correctly tagged and named draft themes (EN + AR), ready for human review and publishing.

## Tasks

1. **Curated content**
   - `content/palettes.ts` — all 45 palettes from `docs/05` §1 (`as const satisfies readonly CuratedPalette[]`), plus `getPalette(id)`; build-time check that every hex is valid.
   - `content/aesthetics.ts` — all 40 recipes from `docs/05` §2 using the `AestheticRecipe` interface. Turn the table into concrete parameter ranges per wallpaper kind (e.g. `scatter: { density: [0.35, 0.6], sizeMin: [0.04, 0.06], sizeMax: [0.09, 0.14], rotate: true, grain: [0.04, 0.1] }`). Write real EN and AR descriptions (2 sentences each, native Arabic). `variants: 10` default.
   - Re-run `npm run glyphs:build` — it now validates aesthetic decor glyphs too; fix any missing names.

2. **Spec builder** (pure, in `lib/render/`):
   - `build-spec.ts` — `buildSpec(recipe, palette, rng): ThemeSpec` per `docs/05` §7, ending with `themeSpecSchema.parse`.
   - `icon-colors.ts` — `resolveIconColours(fill, palette)` → best candidate by contrast, or `null` if none reaches 3:1.
   - `qa.ts` — `qaSpec(spec, manifestNames): { ok: boolean; reasons: string[]; minIconContrast: number }` (rules 1–4 in `docs/05` §8).
   - `naming.ts` — `baseNames(recipe, palette)` → `{ en: 'Lavender Haze Y2K', ar: 'واي تو كي: ضباب اللافندر' }`; `withSuffix(names, n)` (EN roman numerals II, III…; AR digits 2, 3…); `slugFor(nameEn, randomSuffix)`.
   - `style-tags.ts` — `deriveStyleTags(spec, palette)` using `docs/05` §9 mapping and explicit curated palette context.

3. **Generator service** — `server/services/theme-generate.ts`:
   `generateDrafts({ aesthetic, count, seed, actor, autoApprove = false })`:
   - Create a `generation_runs` row (`running`).
   - Load existing `preview_hash` values (all statuses except rejected) once.
   - Treat `(aesthetic, seed, count)` as an idempotent seeded batch: count non-rejected themes from its prior runs toward the target; a completed batch creates zero new themes. Refresh this count under the generator lock before every insertion, so simultaneous runs cannot exceed the target. Failed/interrupted retries fill the remainder. Use a new seed for another batch.
   - Loop up to `count × 3` candidates: `rng = createRng(seed + i)`, cycle palettes uniformly by candidate index, `buildSpec`, `qaSpec` (fail → `skippedQa++`), fingerprint the 72×156 home wallpaper with the shared renderer, Hamming ≤ 6 against existing + this run → `skippedDuplicates++`. Review thumbnails show the full home preview, while the fingerprint excludes fixed app/widget overlays.
   - Accepted: unique names (query existing names with the same base; apply suffix), slug with 4 random base36 chars (retry on unique violation), tags (aesthetic + recipe moods ≤ 3 + derived styles + namespaced season), `tags_text` (all tag names EN + AR), provisional `color_family`, `spec_hash` and provisional `preview_hash`. A short `dbPool` transaction acquires a global generator advisory lock, refreshes/rechecks duplicate hashes and names, and inserts theme + `theme_tags` atomically with `status: 'draft'`, `source: 'generated'`, `generation_run_id`. Render outside the transaction; concurrent runs cannot insert duplicates based on an outdated snapshot.
   - `autoApprove` (CLI only; refused when `VERCEL_ENV=production`): transition each to `approved` via `transitionStatements`.
   - Stop when `count` accepted; finish the run row (`completed`/`failed`, counts, log lines). Return `{ data: { runId, created, skippedDuplicates, skippedQa }, tags: [] }`.

4. **Seeds** (idempotent upserts by slug/key):
   - `scripts/seed-taxonomy.ts` — aesthetic tags from `content/aesthetics.ts` (sort order = table order) + moods, seasons, styles from `docs/05` §10 (EN + AR).
   - `scripts/seed-apps.ts` — `content/apps.ts` → `apps`.
   - `scripts/seed-settings.ts` — defaults from `docs/02` §6 (only inserts missing keys).
   - npm: `"db:seed": "dotenv -e .env.local -- tsx --conditions=react-server scripts/seed-taxonomy.ts && … seed-apps.ts && … seed-settings.ts"`.

5. **CLI** — `scripts/generate-themes.ts` (npm `themes:generate`): `--aesthetic=<slug>` or `--all`, `--count=12`, `--seed=<int>` (default: current UTC date as YYYYMMDD), `--auto-approve`, `--dry-run` (no DB writes; writes thumbnails + a JSON report to `.tmp/generate/<aesthetic>/` for visual review). Prints a per-aesthetic summary table.

6. **Tests** (`tests/unit/generator/`): `buildSpec` deterministic per seed and always schema-valid for every recipe × palette (loop all combinations with 3 seeds); `resolveIconColours` never returns < 3:1; naming suffix logic EN/AR; style tag mapping; `qaSpec` rejects a crafted low-contrast spec. Integration (skips without DB): `generateDrafts` with count 3 creates 3 drafts with tags and a completed run; second run with the same seed creates 0 (duplicates).

## Run it (dev branch)

```bash
npm run db:seed
npm run themes:generate -- --all --count=12 --dry-run   # look at .tmp/generate/* first, tune recipes if needed
npm run themes:generate -- --all --count=12
npm run themes:generate -- --aesthetic=y2k --count=12 --auto-approve   # dev only, to have published content for P07
npm run themes:publish -- --status=approved --concurrency=3
```

## Acceptance checks

- [ ] Dry run thumbnails look like the aesthetic they claim (fix recipes until they do — this is the product).
- [ ] ~400–480 drafts created across 40 aesthetics; duplicates and QA skips reported per aesthetic.
- [ ] Names are natural in both languages; slugs unique; every draft has exactly one aesthetic tag.
- [ ] At least one aesthetic fully published to R2 for the next phases.
- [ ] tests, typecheck, lint, build pass.

## Finish

Report approval-worthiness per aesthetic from the dry run (which recipes need tuning). Commit: `P06: content & generator`.
