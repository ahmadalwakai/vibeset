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
   - `r2.ts` — `S3Client({ region: 'auto', endpoint: \`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com\`, credentials, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })`. Export an `ObjectStorage` interface + lazy default implementation: `put({ key, body, contentType, cacheControl })`, `head(key)`, `getBytes(key)`, `deleteMany(keys)` (batches of 1000), `deletePrefix(prefix)` (paginated list + delete), `listPrefixes(prefix)` (paginated immediate child prefixes for retention), `presignPut({ key, contentType, expiresIn = 300 })`. Shared pure key/prefix validation lives in `lib/validation/storage.ts`.
   - `keys.ts` — `themeAssetKey(themeId, version, file, attemptId)`, `themeAttemptPrefix(themeId, version, attemptId)`, `themeVersionPrefix(themeId, version)`, `themePrefix(themeId)`, `incomingUploadKey(userId, uploadId)`, `wallpaperUploadKeys(uploadId)` (`full.jpg`, `preview.webp`), `avatarKey(userId, hash)`. Theme/upload/attempt ids are UUIDs; Better Auth user ids are validated opaque path segments. Every asset key includes its required attempt UUID under `themes/{id}/v{version}/{attemptId}/`.
   - `urls.ts` — `cdnUrl(key)`; client-safe twin in `lib/utils/cdn.ts` using `NEXT_PUBLIC_CDN_URL`.

2. **State machine** — `server/services/theme-status.ts`:
   - `TRANSITIONS` table exactly as `docs/02` §7; `allowedTransitions(status, actor)` (used by admin UI later); `assertTransition(theme, to, actor, reason?)` → throws `INVALID_STATE` / `FORBIDDEN` / `VALIDATION` (reason required for rejections).
   - `transitionStatements(theme, to, actor, reason?)` → conditional CTE statement in an array for `db.batch`: guarded update plus audit inserted only from `UPDATE ... RETURNING`, so conflicts cannot commit false audits.
   - `transitionThemeStatus({ themeId, to, actor, reason })` → loads theme, asserts, runs `db.batch`, verifies 1 row updated (else `CONFLICT`), returns `{ data, tags }`. Every transition into `published` is **rejected here** (only the publish service may do it).
   - `Actor` type: `{ kind: 'user'; userId; role; isCreator } | { kind: 'system'; label: string }`.

3. **Publish service** — `server/services/theme-publish.ts`, `publishTheme({ themeId, actor, force = false, storage = defaultStorage })`:
   1. Load theme; require status `approved`, `published` or `archived`; admin or system actor.
   2. If `published` and `assets_spec_hash === spec_hash` and not `force` → return `{ skipped: true }`.
   3. Capture `{assetVersion, status, specHash}`; `next = asset_version + 1`, generate an attempt UUID. Render with `lib/render` + `server/render`: home wallpaper at `phone`, `tablet`, `desktop` (skip desktop for `image` kind; each home/lock photo fetched via `storage.getBytes`), `previewHome` + `previewLock` (720×1560 WebP q82), `thumb` (360×780 WebP q80 from previewHome), `og` (1200×630 JPEG q85). Phone JPEG > 3 MB → re-encode q88. Archived republication always renders a new version.
   4. Dominant colour from `thumb` (`sharp().stats().dominant`) → `color_family`; `preview_hash` uses the shared 72×156 home-wallpaper fingerprint from docs/05 §8, including the focal crop for photos.
      The thumb must be ≤ 80,000 bytes; retry lower WebP qualities from the resized source and fail if it remains over budget. Phone budget is 3,000,000 bytes.
   5. Upload all files into this attempt's unique prefix in parallel (limit 4) with `Cache-Control: public, max-age=31536000, immutable`. Drain all started operations before handling failure.
   6. In a short `dbPool` transaction, select the row `FOR UPDATE`, verify all three captured fields, and update theme (`assets`, `asset_version = next`, `assets_spec_hash = spec_hash`, colours, hash, `status = 'published'`, `published_at = coalesce(published_at, now())`, `publish_error = null`) with the same version/status/spec-hash predicates. Require one returned row before inserting audit `theme.published`, including attempt UUID. Conflict → delete only this attempt prefix and throw `CONFLICT`. Never delete a shared `v{next}` prefix on failure. If commit outcome is uncertain, preserve uploaded files and return `INTERNAL` without writing a misleading publish failure.
   7. On render/upload error: best-effort delete only this attempt prefix, store sanitized `publish_error` (≤ 500 chars) only while the captured fields still match, audit the failed attempt (mark stale if appropriate), throw `RENDER_FAILED`. Cleanup or invalidation failures after a confirmed commit cannot change publication into a failure.
   8. Return `{ data: { assetVersion: next, skipped: false }, tags, cleanup: { themeId, keepFromVersion: next - 1 } }`; tags per `docs/03` §7 (find collections containing the theme; creator handle if owned by a creator).
      An unchanged skipped publication returns the same required cache tags and a retention descriptor for its current version, allowing an idempotent retry to repair post-commit cache/cleanup failures without forcing another render.
   - `cleanupOldVersions(themeId, keepFromVersion)` re-reads current database state and deletes complete `themes/{id}/v{n}/` prefixes for `n < min(keepFromVersion, currentVersion - 1)`. The previous version is kept on purpose: cached pages may still reference its URLs until they revalidate. An injected storage implementation is accepted for tests and scripts.

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
