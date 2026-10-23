---
description: 'P05 · Storage & publishing — R2 client, keys/URLs, theme status state machine, publish service, publish API + CLI'
agent: 'agent'
---

# P05 · Storage & publish pipeline

Read first: [architecture §6, §9](../../docs/01-architecture.md) · [data model §7](../../docs/02-data-model.md) · [API §5, §7](../../docs/03-api-and-permissions.md) · [server rules](../instructions/server.instructions.md)

## Goal

Approved themes can be rendered, uploaded to R2 under versioned immutable keys and published safely (idempotent, concurrency-safe, invalidating the right caches) from the admin API or the CLI.

## Manual setup (tell me if anything is missing before coding)

1. Cloudflare R2 buckets `vibeset-dev` (dev/preview) and `vibeset-assets` (prod). API token with Object Read & Write on both.
2. Dev public access: enable the bucket's `r2.dev` URL (dev only). Prod: custom domain `cdn.vibeset.app`.
3. CORS on both buckets:
   ```json
   [{ "AllowedOrigins": ["http://localhost:3000", "https://vibeset.app", "https://*.vercel.app"],
      "AllowedMethods": ["GET", "HEAD", "PUT"], "AllowedHeaders": ["Content-Type"],
      "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 86400 }]
   ```
4. Lifecycle rule: delete objects with prefix `uploads/incoming/` after 1 day.
5. `.env.local`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_CDN_URL`, `INTERNAL_API_SECRET`.

## Tasks

1. **Storage** — `server/storage/`:
   - `r2.ts` — `S3Client({ region: 'auto', endpoint: \`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com\`, credentials, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })`. Export an `ObjectStorage` interface + default implementation: `put({ key, body, contentType, cacheControl })`, `head(key)`, `getBytes(key)`, `deleteMany(keys)` (batches of 1000), `deletePrefix(prefix)` (paginated list + delete), `presignPut({ key, contentType, expiresIn = 300 })`.
   - `keys.ts` — `themeAssetKey(themeId, version, file)`, `themeVersionPrefix(themeId, version)`, `themePrefix(themeId)`, `incomingUploadKey(userId, uploadId)`, `wallpaperUploadKeys(uploadId)` (`full.jpg`, `preview.webp`), `avatarKey(userId, hash)`. Validate ids (uuid) before building keys.
   - `urls.ts` — `cdnUrl(key)`; client-safe twin in `lib/utils/cdn.ts` using `NEXT_PUBLIC_CDN_URL`.

2. **State machine** — `server/services/theme-status.ts`:
   - `TRANSITIONS` table exactly as `docs/02` §7; `allowedTransitions(status, actor)` (used by admin UI later); `assertTransition(theme, to, actor, reason?)` → throws `INVALID_STATE` / `FORBIDDEN` / `VALIDATION` (reason required for rejections).
   - `transitionStatements(theme, to, actor, reason?)` → array of Drizzle queries (update with `WHERE status = $from` guard + audit insert) for use inside a caller's `db.batch`.
   - `transitionThemeStatus({ themeId, to, actor, reason })` → loads theme, asserts, runs `db.batch`, verifies 1 row updated (else `CONFLICT`), returns `{ data, tags }`. `approved → published` is **rejected here** (only the publish service may do it).
   - `Actor` type: `{ kind: 'user'; userId; role; isCreator } | { kind: 'system'; label: string }`.

3. **Publish service** — `server/services/theme-publish.ts`, `publishTheme({ themeId, actor, force = false, storage = defaultStorage })`:
   1. Load theme; require status `approved`, `published` or `archived`; admin or system actor.
   2. If `published` and `assets_spec_hash === spec_hash` and not `force` → return `{ skipped: true }`.
   3. `next = asset_version + 1`. Render with `lib/render` + `server/render`: home wallpaper at `phone`, `tablet`, `desktop` (skip desktop for `image` kind; photo fetched via `storage.getBytes`), `previewHome` + `previewLock` (720×1560 WebP q82), `thumb` (360×780 WebP q80 from previewHome), `og` (1200×630 JPEG q85). Phone JPEG > 3 MB → re-encode q88.
   4. Dominant colour from `thumb` (`sharp().stats().dominant`) → `color_family`; `preview_hash` = dHash of thumb.
   5. Upload all files in parallel (limit 4) with `Cache-Control: public, max-age=31536000, immutable`.
   6. `db.batch`: update theme (`assets`, `asset_version = next`, `assets_spec_hash = spec_hash`, colours, hash, `status = 'published'`, `published_at = coalesce(published_at, now())`, `publish_error = null`) **`WHERE id = $id AND asset_version = $current`** + audit `theme.published`. Zero rows → delete the uploaded `v{next}` prefix and throw `CONFLICT`.
   7. On any render/upload error: store `publish_error` (≤ 500 chars), audit `theme.publish_failed`, throw `RENDER_FAILED`.
   8. Return `{ data: { assetVersion: next, skipped: false }, tags, cleanup: { themeId, keepFromVersion: next - 1 } }`; tags per `docs/03` §7 (find collections containing the theme; creator handle if owned by a creator).
   - `cleanupOldVersions(themeId, keepFromVersion)` deletes `themes/{id}/v{n}/` for `n < keepFromVersion`. The previous version is kept on purpose: cached pages may still reference its URLs until they revalidate.

4. **Routes**
   - `app/api/admin/themes/[id]/publish/route.ts` — `export const maxDuration = 60`; `handleRoute`; `requireAdmin`; body `{ force?: boolean }`; call service; `revalidateTag(tag, 'max')` for each tag; `after(() => cleanupOldVersions(...))`; respond `{ data }`.
   - `app/api/internal/revalidate/route.ts` — `Authorization: Bearer ${INTERNAL_API_SECRET}` (constant-time compare); body `{ tags: string[] }` (≤ 200, pattern-checked against `CacheTags` shapes); `revalidateTag(tag, 'max')`.

5. **CLI** — `scripts/publish-themes.ts` (npm `themes:publish`): flags `--status=approved|stale|archived`, `--ids=a,b`, `--limit`, `--concurrency=3`, `--force`. Actor `{ kind: 'system', label: 'cli' }`. Resumable (re-queries each run), per-item progress line, summary, then `POST /api/internal/revalidate` with all tags (warn and continue if unreachable). `stale` = published with `assets_spec_hash <> spec_hash`.

6. **Dev helper** — `scripts/dev-sample-theme.ts` (refuses in production): inserts one `approved` theme from a fixed valid spec (generated wallpaper) so you can test publishing before P06.

7. **Tests**
   - `tests/unit/server/theme-status.test.ts` — table-driven: every from/to pair × actor kind (owner creator, other user, admin, system) → allowed or the exact error code.
   - `tests/unit/server/keys.test.ts` — key builders reject invalid ids.
   - `tests/integration/publish.test.ts` (skips without DB) — with an in-memory `ObjectStorage` fake: publish → assets recorded, version 1; publish again → skipped; force → version 2 (v1 kept); force again → version 3 and cleanup removes the `v1/` prefix; concurrent publish of the same theme → one `CONFLICT`.

## Acceptance checks

- [ ] `tsx scripts/dev-sample-theme.ts` then `npm run themes:publish -- --status=approved` publishes; objects visible in R2; CDN URLs load in the browser with immutable cache headers.
- [ ] Re-running publish skips; `--force` bumps the version; only the current and previous versions remain in R2.
- [ ] Non-admin call to the publish route → 403; missing theme → 404; draft theme → 409 `INVALID_STATE`.
- [ ] tests, typecheck, lint, build pass.

## Finish

Commit: `P05: storage & publish pipeline`.
