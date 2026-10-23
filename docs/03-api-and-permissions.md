# Vibeset — API, Permissions & Data Contracts

Every mutation, endpoint and DTO is listed here. When you add or change one, update this file in the same commit and check every consumer (user, creator, admin, public API, scripts).

---

## 1. Permission matrix

| Capability | Visitor | User | Creator | Admin |
|---|:-:|:-:|:-:|:-:|
| Browse, search, view published themes, collections, creator pages | ✓ | ✓ | ✓ | ✓ |
| Download wallpapers, export icons, decor widgets | ✓ | ✓ | ✓ | ✓ |
| Remix in Studio (local) + share remix link | ✓ | ✓ | ✓ | ✓ |
| Favourites | local only | ✓ synced | ✓ | ✓ |
| Personal collections (private / unlisted) | – | ✓ | ✓ | ✓ |
| Save remix to account (generated wallpapers only) | – | ✓ | ✓ | ✓ |
| Report a theme | ✓ (rate-limited) | ✓ | ✓ | ✓ |
| Export / delete own account | – | ✓ | ✓ | ✓ |
| Apply to become creator (18+) | – | ✓ | – | – |
| Upload wallpaper images | – | – | ✓ | ✓ |
| Create, edit, submit, withdraw, delete own themes | – | – | ✓ | ✓ |
| View own theme stats | – | – | ✓ | ✓ |
| Review, approve, reject, publish, archive any theme | – | – | – | ✓ |
| Generator, publish queue | – | – | – | ✓ |
| Manage collections, tags, app catalogue, site settings | – | – | – | ✓ |
| Manage users (role, ban), creators, reports; read audit log | – | – | – | ✓ |

Hard rules: admins cannot demote/ban themselves; the last admin cannot be demoted; banned users fail every guard; suspended creators lose creator capability (their published themes stay unless an admin archives them).

---

## 2. Pages by role

| Area | Routes (all under `app/[locale]/`) | Guard |
|---|---|---|
| Public | `/`, `/explore`, `/t/[slug]`, `/a/[slug]`, `/collections`, `/collections/[slug]`, `/c/[handle]`, `/studio`, `/setup/ios`, `/setup/android`, `/setup/desktop`, `/legal/[doc]`, `/sign-in` | none |
| User | `/saved`, `/account`, `/become-creator`, `/collections/u/[id]` (owner, or anyone with the link if unlisted) | `requireUserPage()` (except unlisted view) |
| Creator | `/creator`, `/creator/themes`, `/creator/themes/new`, `/creator/themes/[id]`, `/creator/profile` | `requireCreatorPage()` |
| Admin | `/admin`, `/admin/themes`, `/admin/themes/[id]`, `/admin/review`, `/admin/publish`, `/admin/generator`, `/admin/collections`, `/admin/collections/[id]`, `/admin/tags`, `/admin/apps`, `/admin/reports`, `/admin/users`, `/admin/creators`, `/admin/settings`, `/admin/audit` | `requireAdminPage()` |

Page guards redirect (`/sign-in?next=…`) or `notFound()` (for wrong role — don't reveal admin routes). Data functions and actions re-check independently.

---

## 3. Shared types

### 3.1 `lib/result.ts`

```ts
export type ErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'RATE_LIMITED'
  | 'CONFLICT' | 'INVALID_STATE' | 'UPLOAD_INVALID' | 'RENDER_FAILED' | 'FEATURE_DISABLED' | 'INTERNAL';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } };

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 422, RATE_LIMITED: 429,
  CONFLICT: 409, INVALID_STATE: 409, UPLOAD_INVALID: 400, RENDER_FAILED: 500, FEATURE_DISABLED: 403, INTERNAL: 500,
};
```

`message` is an English developer message for logs. **The UI never shows it** — it translates `error.code` via the `errors` message namespace (`errors.RATE_LIMITED`, …) and shows `fieldErrors` next to fields.

### 3.2 `server/action.ts` — `createAction`

```ts
createAction({
  input: z.object({...}),                  // Zod schema; parse failure → VALIDATION with fieldErrors
  auth: 'public' | 'user' | 'creator' | 'admin',
  rateLimit?: { key: (ctx) => string; limit: number; windowSec: number },
  feature?: keyof FeaturesSetting,          // FEATURE_DISABLED when off
  handler: async (input, ctx) => T,         // ctx: { session | null, user | null, creator | null, ipHash }
}) => (raw: unknown) => Promise<ActionResult<T>>
```

Maps `AppError(code)` to `{ ok: false }`; unknown errors → `INTERNAL` + `console.error` (never leak stack or SQL). Each `server/actions/*.ts` file starts with `'use server'` and only exports actions built with `createAction`.

### 3.3 `lib/dto.ts`

```ts
export type Locale = 'en' | 'ar';
export type ThemeSort = 'trending' | 'new' | 'popular';
export type TagKind = 'aesthetic' | 'style' | 'mood' | 'season';
export type ColorFamily =
  | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple'
  | 'brown' | 'black' | 'white' | 'gray' | 'multi';

export interface TagDTO { slug: string; kind: TagKind; nameEn: string; nameAr: string }
export interface CreatorMiniDTO { handle: string; displayName: string; avatarUrl: string | null }

export interface ThemeCardDTO {
  id: string; slug: string;
  nameEn: string; nameAr: string | null;
  thumbUrl: string | null; dominantColor: string | null;
  tags: TagDTO[];
  isFeatured: boolean; downloadCount: number; favoriteCount: number;
  creator: CreatorMiniDTO | null;
  publishedAt: string | null;               // ISO
}

export interface WallpaperDownloadDTO { size: 'phone' | 'tablet' | 'desktop'; url: string; w: number; h: number; bytes: number }

export interface ThemeDetailDTO extends ThemeCardDTO {
  descriptionEn: string | null; descriptionAr: string | null;
  spec: ThemeSpec;
  previewHomeUrl: string | null; previewLockUrl: string | null; ogUrl: string | null;
  wallpapers: WallpaperDownloadDTO[];
  remixOf: { slug: string; nameEn: string; nameAr: string | null } | null;
}

export interface CollectionCardDTO {
  id: string; slug: string | null; kind: 'editorial' | 'seasonal' | 'user';
  titleEn: string; titleAr: string | null; coverThumbUrl: string | null; itemCount: number;
}
export interface CollectionDetailDTO extends CollectionCardDTO {
  descriptionEn: string | null; descriptionAr: string | null;
  items: Paginated<ThemeCardDTO>;
}

export interface AppDTO { slug: string; name: string; aliases: string[]; category: string; glyph: string; rank: number }
export interface Paginated<T> { items: T[]; nextCursor: string | null }

export interface ThemeListQuery {
  ids?: string[];            // ≤ 100 uuids — when present, all other filters are ignored, results keep this order
                             // (used by Saved to resolve local favourites). Published only.
  q?: string;                // 2..64 chars
  tags?: string[];           // ≤ 5 slugs, AND semantics
  color?: ColorFamily;
  sort: ThemeSort;           // default 'trending'
  cursor?: string | null;
  limit: number;             // 1..48, default 24
}
```

- DTOs carry **both** languages; components call `localized(dto, locale)` (`lib/utils/localized.ts`), falling back to English.
- All mapping from DB rows to DTOs happens in `server/queries/mappers.ts` — one place.
- URLs are absolute CDN URLs built by `server/storage/urls.ts`.

### 3.4 Cursor

`lib/utils/cursor.ts`: base64url JSON `{ s: number | string, id: string }`. Query: `WHERE (sort_col, id) < (s, id) ORDER BY sort_col DESC, id DESC LIMIT limit + 1`. Search mode (`q` set) ranks by `ts_rank_cd` + trigram similarity and uses an offset cursor `{ o: number }`, capped at 200 results. Invalid cursor → `VALIDATION`.

---

## 4. Server Actions

Columns: **Auth** (`public`/`user`/`creator`/`admin`), **RL** = rate limit, **Tags** = cache tags invalidated.

### User — `server/actions/favorites.ts`, `collections.ts`, `studio.ts`, `reports.ts`, `account.ts`

| Action | Input | Output | Auth | RL | Tags |
|---|---|---|---|---|---|
| `toggleFavorite` | `{ themeId }` | `{ favorited }` | user | 120/min/user | — (counts nightly) |
| `mergeLocalFavorites` | `{ themeIds: uuid[] ≤ 500 }` | `{ merged }` | user | 10/h | — |
| `createCollection` | `{ titleEn 1–60, visibility: 'private'\|'unlisted' }` | `{ id }` | user | 30/h | — |
| `updateCollection` | `{ id, titleEn?, visibility? }` | `{ id }` | user (owner) | — | — |
| `deleteCollection` | `{ id }` | `{ id }` | user (owner) | — | — |
| `addToCollection` / `removeFromCollection` | `{ collectionId, themeId }` | `{ itemCount }` | user (owner) | 300/h | — |
| `reorderCollection` | `{ collectionId, themeIds[] }` | `{ ok }` | user (owner) | — | — |
| `saveRemix` | `{ spec, nameEn 1–60, remixOfSlug? }` | `{ id }` | user | 30/h | — |
| `updateRemix` / `deleteRemix` | `{ id, … }` | `{ id }` | user (owner, draft) | — | — |
| `submitReport` | `{ themeId, reason, details? ≤ 1000 }` | `{ id }` | public | 5/h per user-or-ip | — |
| `updateAccount` | `{ name 1–60, locale }` | `{ ok }` | user | — | — |

Notes: `saveRemix` rejects `kind: 'image'` wallpapers for non-creators (`FORBIDDEN`); user collections are never in shared caches.

### Creator — `server/actions/creator.ts`

| Action | Input | Output | Auth | RL | Tags |
|---|---|---|---|---|---|
| `applyForCreator` | `{ handle, displayName, bio?, links ≤ 3, isAdult: true }` | `{ status }` | user | 3/day | — |
| `updateCreatorProfile` | `{ displayName, bio?, links, avatarUploadId? }` | `{ ok }` | creator | — | `creator:{handle}` (`updateTag`) |
| `createWallpaperUpload` | `{ contentType: 'image/jpeg'\|'image/png'\|'image/webp', bytes ≤ 15 MB }` | `{ uploadId, url, headers }` | creator | 20/h | — |
| `finalizeWallpaperUpload` | `{ uploadId }` | `{ uploadId, assetKey, previewUrl, width, height, palette[] }` | creator (owner) | — | — |
| `createCreatorTheme` | `{ spec, nameEn, nameAr?, descriptionEn?, descriptionAr?, tagSlugs[] }` | `{ id }` | creator | 30/day | — |
| `updateCreatorTheme` | `{ id, …same }` | `{ id }` | creator (owner; draft/rejected) | — | — |
| `submitTheme` / `withdrawTheme` | `{ id }` | `{ status }` | creator (owner) | 30/day | — |
| `deleteCreatorTheme` | `{ id }` | `{ id }` | creator (owner; draft/rejected) | — | — |

`tagSlugs`: exactly one `aesthetic` tag + up to 5 others.

### Admin — `server/actions/admin/*.ts`

| Action | Input | Output | Tags |
|---|---|---|---|
| `adminUpdateTheme` | `{ id, nameEn, nameAr, descriptionEn, descriptionAr, tagSlugs, spec?, isFeatured }` | `{ id, stale }` | `themes`, `theme:{slug}` if published |
| `adminTransitionThemes` | `{ ids ≤ 100, to: 'approved'\|'rejected'\|'archived'\|'draft', reason? }` | `{ results: { id, ok, code? }[] }` | per result |
| `adminSetFeatured` | `{ ids, featured }` | `{ count }` | `themes`, `theme:{slug}…` |
| `adminTagThemes` | `{ ids, add: slugs, remove: slugs }` | `{ count }` | `themes`, `theme:{slug}…` |
| `adminAddToCollection` | `{ ids, collectionId }` | `{ count }` | `collections`, `collection:{slug}` |
| `adminDeleteThemes` | `{ ids }` (non-published) | `{ count }` | — |
| `adminGenerateDrafts` | `{ aesthetic, count 1–24, seed? }` | `{ runId, created, skippedDuplicates, skippedQa }` | — |
| `adminUpsertCollection` / `adminDeleteCollection` / `adminReorderCollection` / `adminSetPinned` | … | … | `collections`, `collection:{slug}` |
| `adminUpsertTag` / `adminDeleteTag` / `adminMergeTags` | … | … | `taxonomy`, `themes` |
| `adminUpsertApp` / `adminDeleteApp` / `adminReorderApps` | … | … | `apps` |
| `adminResolveReport` | `{ id, action: 'dismiss'\|'archive_theme'\|'ban_owner', note }` | `{ ok }` | `themes`… if archived |
| `adminSetRole` | `{ userId, role: 'user'\|'admin' }` | `{ ok }` | — |
| `adminBanUser` / `adminUnbanUser` | `{ userId, reason, archiveThemes }` | `{ ok }` | `themes`… if archived |
| `adminReviewCreator` | `{ userId, decision: 'approve'\|'reject'\|'suspend', reason? }` | `{ status }` | `creator:{handle}` |
| `adminUpdateSetting` | `{ key, value }` (validated per key) | `{ ok }` | `settings` |

Admin actions use `updateTag` for immediate consistency and write `audit_log`.

---

## 5. Route Handlers

| Method & path | Purpose | Auth | Cache | RL |
|---|---|---|---|---|
| `GET /api/v1/themes` | `Paginated<ThemeCardDTO>` from `ThemeListQuery` | public | `public, s-maxage=300, stale-while-revalidate=86400` | — |
| `GET /api/v1/themes/[slug]` | `ThemeDetailDTO` or 404 | public | same | — |
| `GET /api/v1/collections` | `CollectionCardDTO[]` (editorial + active seasonal) | public | same | — |
| `GET /api/v1/collections/[slug]` | `CollectionDetailDTO` (`?cursor`) | public | same | — |
| `GET /api/v1/tags` | `TagDTO[]` (`?kind`) | public | same | — |
| `GET /api/v1/apps` | `AppDTO[]` | public | same | — |
| `GET /api/me/favorites` | `{ themeIds: string[] }` | user (401 otherwise) | `private, no-store` | — |
| `POST /api/track` | `{ themeId, event: 'view'\|'download'\|'icon_export'\|'remix'\|'setup_complete' }` → 204 | public | no-store | 120/min/ipHash |
| `GET /api/account/export` | JSON download of the user's data | user | no-store | 5/day |
| `POST /api/admin/themes/[id]/publish` | `{ force?: boolean }` → `{ assetVersion, skipped }` | admin | no-store | — |
| `POST /api/internal/revalidate` | `{ tags: string[] }` | `Bearer INTERNAL_API_SECRET` | no-store | — |
| `GET /api/cron/daily` | popularity + counters + cleanup | `Bearer CRON_SECRET` | no-store | — |
| `GET, POST /api/auth/[...all]` | Better Auth | — | — | Better Auth limiter |

Error body for every handler: `{ "error": { "code": ErrorCode, "message": string } }` with `HTTP_STATUS[code]`. Validation of query/body with Zod; unknown query params ignored.

The `/api/v1` contract is consumed by the Phase 2 native app — **never make breaking changes**; add fields or create `/api/v2`.

---

## 6. Rate limits (`server/rate-limit.ts`)

Single atomic statement on `app_rate_limits` (no read-modify-write):

```sql
INSERT INTO app_rate_limits (key, count, window_start) VALUES ($1, 1, now())
ON CONFLICT (key) DO UPDATE SET
  count = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE app_rate_limits.count + 1 END,
  window_start = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE app_rate_limits.window_start END
RETURNING count;
```

Allowed when `count ≤ limit`. Keys: `{scope}:{userId|ipHash}`. Rows older than 2 days are purged by the daily cron. Better Auth endpoints use Better Auth's own limiter (database storage).

Better Auth retains its route/plugin limits but uses `server/auth-rate-limit.ts` as its database-backed storage: salted SHA-256 keys, atomic conditional upsert into `rate_limit`, and a denial-only read for Retry-After. Session creation also hashes its IP field before persistence; no raw authentication IP is stored.

---

## 7. Cache tags & invalidation matrix (`server/cache.ts`)

```ts
export const CacheTags = {
  themes: 'themes',
  theme: (slug: string) => `theme:${slug}`,
  collections: 'collections',
  collection: (slug: string) => `collection:${slug}`,
  taxonomy: 'taxonomy',
  apps: 'apps',
  settings: 'settings',
  creator: (handle: string) => `creator:${handle}`,
} as const;
```

| Event | Invalidate |
|---|---|
| Theme published / re-rendered / archived / republished | `themes`, `theme:{slug}`, `collections` (+ each `collection:{slug}` containing it), `creator:{handle}` if creator-owned |
| Published theme metadata/tags/featured edited | `themes`, `theme:{slug}` |
| Tag created/updated/merged/deleted | `taxonomy`, `themes` |
| Editorial/seasonal collection changed | `collections`, `collection:{slug}` |
| App catalogue changed | `apps` |
| Site setting changed | `settings` |
| Creator profile changed / status changed | `creator:{handle}` (+ `themes` if themes archived) |
| Daily cron finished | `themes` |

Rules: slugs are **immutable after first publish** (admin can rename display names only). Cached read functions declare tags with the same helpers.

---

## 8. Audit events (`server/audit.ts`)

`theme.status.{to}`, `theme.updated`, `theme.published`, `theme.publish_failed`, `theme.deleted`, `theme.featured`, `theme.tagged`, `collection.{created|updated|deleted|reordered}`, `tag.{created|updated|merged|deleted}`, `app.{created|updated|deleted}`, `report.resolved`, `user.role.set`, `user.banned`, `user.unbanned`, `creator.{approved|rejected|suspended}`, `settings.updated`, `generator.run`.

`meta` holds before/after for changed fields (never secrets or emails of other users).

---

## 9. Cross-role consistency rules

1. **One service per mutation.** User, creator and admin actions, route handlers and scripts call the same `server/services/*` function. No duplicated business logic in actions.
2. **Ownership is checked in the service**, not only in the action (scripts and admin paths reuse services with an explicit `actor`).
3. **Public = `status = 'published'`**, everywhere, including `/api/v1`, sitemap, OG, search, collections, creator pages and "More like this".
4. **DTO change checklist**: `lib/dto.ts` → `server/queries/mappers.ts` → `/api/v1` handlers → client consumers (`rg "ThemeCardDTO"`) → docs. Additive only for `/api/v1`.
5. **New mutation checklist**: Zod input in `lib/validation/*`, service with tags, action/handler, audit entry, rate limit decision, cache tags in §7, permission row in §1, i18n error keys, tests.
6. Optimistic UI must reconcile with the server result and roll back on `ok: false`.
