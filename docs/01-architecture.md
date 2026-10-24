# Vibeset — Architecture

Source of truth for stack, structure and cross-cutting rules. Copilot must follow this file; if a change is needed, update this file in the same commit.

---

## 1. Stack & versions

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 24 LTS (min 20.9) | Next 16 requirement; Node 22+ ships a global `WebSocket` (needed by the Neon pool client) |
| Framework | **Next.js 16 (≥ 16.3)**, App Router, Turbopack, **Cache Components on** | 14.x is end-of-life since Oct 2025. 16.3 adds `next/root-params`, which next-intl uses for locale-aware static rendering |
| React | 19.2 | Ships with Next 16 |
| Language | TypeScript, `strict: true` | — |
| UI | **Chakra UI v3** (`@chakra-ui/react` ^3.34) + `@emotion/react` + `next-themes` | Same as tyrerescue; v3 components (Drawer, ActionBar, Steps, ColorPicker, FileUpload, EmptyState) cover our needs |
| Animation | `motion` (v12, `motion/react`) | Gestures (drag-to-dismiss sheets), layout animations, `useReducedMotion` |
| UI icons | `@phosphor-icons/react` | One icon language across UI and theme glyphs |
| i18n | **next-intl v4** (`en`, `ar`), `localePrefix: 'as-needed'` | RTL, typed messages, `next/root-params` integration |
| Database | **Neon Postgres** | Branch per preview deployment, scale-to-zero |
| ORM | **Drizzle ORM — stable line** (`drizzle-orm@latest`, not the 1.0 RC) + `drizzle-kit` | Same as tyrerescue. Upgrade to v1 later with `drizzle-kit up` |
| Auth | **Better Auth** (Google + email magic link, `admin` plugin) | Auth.js/NextAuth is now maintained by the Better Auth team, who recommend Better Auth for new projects; NextAuth v5 never left beta |
| Validation | Zod 4 | Every boundary: actions, route handlers, env, theme specs, URL state |
| Object storage | **Cloudflare R2** (S3 API via `@aws-sdk/client-s3`) | Zero egress fees — the main cost driver for a free wallpaper app |
| Server rendering | `@resvg/resvg-js` (SVG → PNG) + `sharp` (encode, resize, composite, stats) | Fast, no headless browser, deterministic |
| Colour science | `culori` | OKLCH, WCAG contrast, interpolation |
| Theme glyphs | `@phosphor-icons/core` (MIT, ~1,500 icons × 6 weights) | Generic symbols, no trademark exposure |
| Client export | `fflate` (ZIP), `lz-string` (share links) | Small, fast |
| Email | Resend | Magic links |
| Charts (admin) | Recharts | Same as tyrerescue |
| Tests | Vitest (unit/integration), Playwright (e2e) | Same as tyrerescue (Vitest) |
| Scripts | `tsx` + `dotenv-cli` | Same as tyrerescue |
| Hosting | Vercel (Fluid compute) + Neon Vercel integration + Cloudflare R2 custom domain | — |
| Monitoring | Sentry (optional, P17), Vercel logs, `audit_log` table | — |

**Do not add dependencies outside this table without a one-line justification in the PR/commit.** No TanStack Query (our client fetching is small and explicit), no Tailwind, no Prisma, no NextAuth, no `@chakra-ui/icons` (v2 only).

---

## 2. System diagram

```
                ┌────────────────────────── Vercel · Next.js 16 ──────────────────────────┐
 Browser/PWA ──▶│ proxy.ts  (next-intl locale routing + optimistic auth gate)             │
 (iPhone,       │   App Router · React Server Components · Cache Components             │
  Android,      │   ├─ Public pages ........ cached reads ('use cache' + cacheTag)       │
  desktop)      │   ├─ Server Actions ...... Zod → guards → services → invalidate tags   │
                │   ├─ Route Handlers ...... /api/v1/* (public JSON), /api/track,        │
                │   │                        /api/cron/*, /api/admin/*, /api/auth/*      │
                │   └─ Publish pipeline .... lib/render → resvg → sharp → R2            │
                └──────────────┬──────────────────────────────────┬────────────────────┘
                               │ Drizzle (neon-http / ws pool)     │ S3 API
                        ┌──────▼──────┐                     ┌──────▼───────┐
                        │  Neon PG    │                     │ Cloudflare R2│
                        └─────────────┘                     └──────┬───────┘
   images, previews, wallpapers  ◀──────── cdn.vibeset.app ◀───────┘  (zero egress)

 On the device: the SAME lib/render code → <canvas> → PNG/JPEG → Web Share (iOS) / ZIP (Android, desktop)
```

---

## 3. Folder structure (no `src/` — same convention as tyrerescue)

```
vibeset/
├─ app/
│  ├─ [locale]/
│  │  ├─ layout.tsx                 ROOT layout (html/body/providers). There is NO app/layout.tsx
│  │  ├─ not-found.tsx · error.tsx
│  │  ├─ (site)/
│  │  │  ├─ layout.tsx              SiteShell: header, bottom nav, footer
│  │  │  ├─ page.tsx                Home
│  │  │  ├─ explore/page.tsx
│  │  │  ├─ t/[slug]/page.tsx       Theme detail
│  │  │  ├─ a/[slug]/page.tsx       Aesthetic landing (tag kind = aesthetic)
│  │  │  ├─ collections/page.tsx · collections/[slug]/page.tsx
│  │  │  ├─ c/[handle]/page.tsx     Creator profile
│  │  │  ├─ studio/page.tsx         Remix studio
│  │  │  ├─ saved/page.tsx          Favourites, my collections, my remixes
│  │  │  ├─ setup/ios/page.tsx · setup/android/page.tsx · setup/desktop/page.tsx
│  │  │  ├─ account/page.tsx
│  │  │  ├─ become-creator/page.tsx
│  │  │  └─ legal/[doc]/page.tsx    terms | privacy | copyright
│  │  ├─ (auth)/sign-in/page.tsx
│  │  ├─ creator/                   CreatorShell — approved creators (+ admins)
│  │  │  └─ page.tsx · themes/page.tsx · themes/new/page.tsx · themes/[id]/page.tsx · profile/page.tsx
│  │  └─ admin/                     AdminShell — admins only
│  │     └─ page.tsx · themes/… · review/… · publish/… · generator/… · collections/… · tags/…
│  │        apps/… · reports/… · users/… · creators/… · settings/… · audit/…
│  ├─ api/
│  │  ├─ auth/[...all]/route.ts     Better Auth
│  │  ├─ v1/…                        Public read API (also used by Phase 2 native app)
│  │  ├─ me/favorites/route.ts      Signed-in user's favourite ids (dynamic, no-store)
│  │  ├─ track/route.ts             Analytics beacon
│  │  ├─ account/export/route.ts    GDPR export
│  │  ├─ admin/themes/[id]/publish/route.ts
│  │  ├─ internal/revalidate/route.ts  Tag invalidation for CLI scripts
│  │  └─ cron/daily/route.ts        Popularity, counters, cleanup (one daily job)
│  ├─ global-not-found.tsx  · sitemap.ts · robots.ts · manifest.ts
├─ components/
│  ├─ ui/          Chakra CLI snippets (provider, color-mode, toaster, tooltip…)
│  ├─ common/      EmptyState, ErrorState, ConfirmDialog, ResponsiveSheet, InfiniteSentinel, motion wrappers
│  ├─ layout/      SiteHeader, BottomNav, SiteFooter, LocaleSwitcher, UserMenu, AdminShell, CreatorShell
│  ├─ theme/       ThemeCard, ThemeGrid, ThemeGridSkeleton, PhoneFrame, HomeScreenPreview,
│  │               LockScreenPreview, FavoriteButton, ThemeActionBar, WallpaperDownloadSheet, IconExportSheet
│  ├─ explore/     SearchInput, FilterBar, FilterSheet, SortMenu, ActiveFilters, InfiniteThemeGrid
│  ├─ studio/      StudioShell, StudioPreview, ColorsPanel, WallpaperPanel, IconsPanel, WidgetsPanel, TypePanel
│  ├─ setup/       IosSetupWizard, AndroidGuide, StepCard
│  ├─ creator/     CreatorThemeForm, WallpaperUploader, SubmissionStatusBadge, StatsCards
│  └─ admin/       DataTable, BulkActionBar, StatCard, DownloadsChart, ThemeEditorForm, SpecJsonEditor,
│                  ReviewDeck, PublishQueue, GlyphPicker
├─ db/
│  ├─ index.ts               `db`  — drizzle neon-http client (default)
│  ├─ pool.ts                `dbPool` — drizzle ws Pool client (auth adapter, interactive tx, scripts)
│  ├─ custom-types.ts        tsvector
│  ├─ relations.ts
│  └─ schema/  auth.ts (generated by Better Auth CLI) · themes.ts · taxonomy.ts · catalog.ts
│              collections.ts · engagement.ts · moderation.ts · system.ts · index.ts
├─ drizzle/migrations/
├─ server/                   server-only code
│  ├─ auth.ts                Better Auth instance (no 'server-only' import — CLI loads it)
│  ├─ guards.ts              getSession, requireUser, requireCreator, requireAdmin (+ page variants)
│  ├─ action.ts              createAction(): Zod + auth + rate limit + error mapping → ActionResult
│  ├─ errors.ts · cache.ts (CacheTags + revalidateTags) · rate-limit.ts · audit.ts · request.ts (ip hash)
│  ├─ queries/               cached public reads ('use cache')
│  ├─ admin-queries/         uncached admin/creator reads (dynamic, auth-checked)
│  ├─ services/              business logic; return { data, tags } — never call next/cache directly
│  ├─ actions/               'use server' thin wrappers (+ actions/admin/*)
│  ├─ storage/  r2.ts · keys.ts · urls.ts
│  ├─ render/   rasterize.ts · glyphs.ts · fonts.ts · noise.ts · hash.ts · og.ts · palette-extract.ts
│  └─ email.ts
├─ lib/
│  ├─ render/                ISOMORPHIC renderer (no DOM, no Node APIs, no React)
│  ├─ client/                browser-only helpers (rasterize, share, zip, platform, track, local storage)
│  ├─ auth-client.ts         Better Auth React client
│  ├─ env.server.ts · env.client.ts
│  ├─ dto.ts                 shared DTO types (imported by server & client)
│  ├─ result.ts              ActionResult + ErrorCode (shared)
│  ├─ theme-assets.ts        ThemeAssets / WallpaperAsset types
│  ├─ validation/            Zod input schemas shared by actions & forms
│  └─ utils/                 slug, cursor, format, localized, cdn
├─ content/                  aesthetics.ts · palettes.ts · apps.ts · fonts.ts · setup-media.ts · legal/ (curated source data)
├─ design/                   Chakra system: system.ts · tokens.ts · semantic-tokens.ts · recipes/ · fonts.ts
├─ hooks/                    useFavorites, useInfiniteThemes, useThemeEditor, usePlatform, useLocalStorage
├─ i18n/                     routing.ts · request.ts · navigation.ts
├─ messages/                 en.json · ar.json
├─ scripts/                  generate-glyphs.ts, seed-*.ts, generate-themes.ts, publish-themes.ts, admin-user.ts …
├─ assets/fonts/             OFL TTFs for server rendering
├─ public/glyphs/v1/         generated per-weight glyph JSON + manifest (immutable)
├─ tests/                    unit/ · integration/ · e2e/
├─ proxy.ts · next.config.ts · drizzle.config.ts · vitest.config.ts · playwright.config.ts · vercel.json
└─ .github/ (copilot instructions + prompts + workflows) · docs/ · AGENTS.md
```

Naming rule: **"Theme" always means the product entity** (table `themes`, type `ThemeSpec`). The Chakra config is the **"system"** (`design/system.ts`). Light/dark is **"colorMode"**. Never call the Chakra config "theme".

---

P02 replaces the P00 verification page with `app/[locale]/layout.tsx` and the localized site shell. `app/global-not-found.tsx` supplies its own bilingual document for unmatched routes (Next 16.4 still requires `experimental.globalNotFound`). The locale catch-all calls `notFound()` so unknown paths retain their language. The temporary Home has translated hero copy and decorative brand artwork; the catalog and destination pages arrive in their ordered phases.

`npm run typecheck` first runs `next typegen` so a fresh checkout has the generated `LayoutProps` and `next/root-params` declarations without requiring a production build.

Codemagic can run the manual `web-production` workflow in the root `codemagic.yaml`. Next configuration enables standalone output; packaging adds `.next/static` and `public` to the traced server and excludes environment files. The archive is specific to the runner OS/architecture. The initial runner is Mac mini M2; use an eligible Linux runner for a Linux server artifact. This CI build does not deploy the app or run database migrations.

The root layout wraps the Chakra provider in `components/ui/emotion-registry.tsx` (per [Chakra's streaming integration](https://chakra-ui.com/docs/get-started/frameworks/next-app)). The registry collects Emotion styles per render and flushes them with `useServerInsertedHTML`, preventing style/script hydration mismatches with Cache Components. `@emotion/cache` is a direct dependency for this integration. Next.js 16.4 also requires an explicit `partialPrefetching: true` for new Cache Components apps. Set `agentRules: false` to preserve this repository's own agent instructions.

P00's temporary page has no external service integrations. It validates the configured CDN URL in Next configuration and supplies tested environment schemas. Server environment validation executes on the first `lib/env.server.ts` import, starting with P01 database/auth integration; the bootstrap page itself does not require Neon or provider credentials. Later service boot must import the validated environment. Core keys are required by the server schema; later-phase Google, Resend and R2 credentials may be blank until used.

## 4. Rendering architecture (the core of the product)

One pure TypeScript renderer, `lib/render`, turns a `ThemeSpec` (JSON tokens, `docs/02`) into SVG strings. The same code runs:

- **on the server** (publish pipeline, generator thumbnails, OG images) → `server/render/rasterize.ts` (resvg → sharp);
- **in the browser** (Studio preview, admin review deck, icon export, 4K/custom wallpaper export) → `lib/client/rasterize.ts` (`<img>` → `<canvas>`).

### 4.1 Rules for `lib/render`

- Pure functions only. No `window`, `document`, `fs`, `fetch`, React, `Math.random`, `Date`.
- All randomness from a seeded PRNG (`prng.ts`, mulberry32). Same spec ⇒ byte-identical SVG (snapshot-tested).
- Allowed SVG features (identical in resvg and browsers): paths, basic shapes, linear/radial gradients, `<pattern>`, `clipPath`, `mask`, `opacity`, transforms, `feGaussianBlur`, `feDropShadow`. **Forbidden**: free text, `<foreignObject>`, `<script>`, external `href`, `feTurbulence`, CSS. Preview clocks use generated digit outlines rather than loading fonts inside an SVG image.
- Glyph markup is injected through a `GlyphSource` interface (`get(name, weight) → string | undefined`) — the renderer never loads data itself.
- Every user-controlled value reaching SVG is validated by Zod first (hex colours, enums, bounded numbers, glyph names `^[a-z0-9-]{1,48}$`, asset keys by strict regex). No free text ever reaches SVG.

### 4.2 Render result

```ts
interface RenderResult {
  svg: string;                       // everything drawable as vector
  width: number;                     // intrinsic SVG coordinate dimensions
  height: number;
  background?: {                     // photo wallpapers only
    kind: 'image'; assetKey: string; focalX: number; focalY: number; dim: number;
    placement?: {                    // optional composed photo viewport
      x: number; y: number; w: number; h: number;
      shape?: 'square' | 'rounded' | 'circle' | 'squircle'; radius?: number;
    };
  };
  grain: number;                     // 0..1 — applied as a post-process, NOT in SVG
  noiseSeed: number;                 // deterministic raster noise
  warnings: string[];                // e.g. missing glyph fallback
  layers?: Array<{                   // ordered scene; rasterizers use these instead of parent SVG
    result: RenderResult; x: number; y: number; w: number; h: number;
    shape?: 'square' | 'rounded' | 'circle' | 'squircle'; radius?: number;
  }>;
}
```

- **Grain** (film noise) is a post-process for speed and consistency: server = `sharp.composite` of a seeded RGBA noise tile (`tile: true`, `blend: 'soft-light'`); client = canvas pattern from the same seeded tile; DOM preview = CSS overlay. Same `noiseSeed`, same tile. Rasterizers preserve the original alpha mask so grain cannot paint outside a shaped export.
- **Photo wallpapers** (`kind: 'image'`): the SVG contains only overlays (including dim, applied once). Rasterizers draw the photo first: the server accepts `focalBackground` bytes supplied by the publish/storage caller (R2 loading is added in P05); the client fetches the validated CDN URL with CORS and `createImageBitmap`, or accepts a local JPEG/PNG/WebP `focalBackground` Blob (≤ 15 MiB) for the development playground and upload preview. DOM preview uses a CSS background. Optional placement is in intrinsic SVG coordinates and carries the photo's viewport and shape into compositions. SVG-in-`<img>` cannot load external images, so never put the photo inside the SVG.
- **Preview scenes** retain ordered `layers` so wallpaper photos, icon crops, grain, and clipping are composed independently in both rasterizers. Their parent SVG is a vector-only inspection representation and is not rasterized a second time. Shared photo bytes are decoded once per export. Rasterizers reject cycles, more than 128 nodes, depth over eight, any canvas over 16.7M pixels, and aggregate layer work over four times that budget.
- Composition callers supply deterministic unique `prefix` values for SVG ids; standalone renderers provide stable defaults. Canonical public types live in `lib/render/types.ts`.
- Wallpaper photo icons composite an opaque palette background beneath the photo and overlays before applying the export shape once. This keeps iOS exports opaque and shaped exports transparent only outside their shape, including when local source pixels have alpha. Photo metadata may coexist with ordered layers for inspection; rasterizers follow the layers.

### 4.3 Glyph data

`scripts/generate-glyphs.ts` reads `@phosphor-icons/core` and writes `public/glyphs/v1/{weight}.json` (`{ [name]: innerSvgMarkup }`, sanitised) + `public/glyphs/v1/manifest.json` (names, categories, tags). Brand-category entries and `-logo` glyphs are excluded (1,432 generic glyphs with Phosphor 2.1.1), following D9. Server reads these from disk (traced via `outputFileTracingIncludes`); browser fetches only the weight in use (immutable cache). Both loaders validate records with the same pure markup validator before exposing a `GlyphSource`.

### 4.4 Fonts

OFL fonts (list in `docs/04`) exist twice: `next/font/google` for DOM, and TTF files in `assets/fonts/` for resvg. `fonts:fetch` also generates committed `content/clock-outlines.json` with fixed `10:24` and `9:41` digit paths through resvg's font conversion, normalized to their bounds. Resvg uses each variable font's default instance; the generated clock paths do not promise variable-weight interpolation. Both preview renderers embed those same paths for font-shape parity; browser SVG images never depend on external fonts. Preview images are **language-neutral** (no words: digits + shapes only) so one image serves both locales. Client exports (wallpapers, icons, decor widgets) contain no text.

### 4.5 Output sizes

| Asset | Size | Format | Where rendered |
|---|---|---|---|
| thumb | 360 × 780 | WebP q80 | server (publish) |
| previewHome / previewLock | 720 × 1560 | WebP q82 | server |
| og | 1200 × 630 | JPEG q85 | server |
| wallpaper phone | 1320 × 2868 | JPEG q92, 4:4:4 | server |
| wallpaper tablet | 2048 × 2732 | JPEG q92 | server |
| wallpaper desktop | 2560 × 1440 | JPEG q92 | server (generated wallpapers only) |
| wallpaper 4K / "my screen" | ≤ 3840 × 2160 or device px | JPEG q92 | client (generated wallpapers only) |
| app icon | 512 × 512 | PNG (iOS: opaque full-bleed; Android/desktop: shaped + transparent) | client |
| decor widget | small 512², medium 1024×482, large 1024×1072 | PNG | client |

iOS canvas limits: keep any canvas ≤ 16.7M pixels and release canvases after use (`canvas.width = canvas.height = 0`).

---

## 5. Data flows

| Flow | Path |
|---|---|
| Browse | RSC page → `server/queries/*` (`'use cache'`, tags) → DTOs → cards with R2 thumbnails |
| Infinite scroll | client `useInfiniteThemes` → `GET /api/v1/themes?cursor=…` (CDN-cached) → append (dedupe by id, AbortController on filter change) |
| Theme detail | RSC (cached by slug) → pre-rendered previews; heavy client code (renderer, export) loaded only when a sheet opens |
| Wallpaper download | pre-rendered: fetch CDN blob → Web Share (iOS) / `<a download>` (others). 4K/custom: dynamic import renderer → canvas → blob |
| Icon export | dynamic import renderer + glyph weight JSON → chunked canvas render (progress, cancel) → iOS Web Share batches / ZIP |
| Track | credential-free `fetch('/api/track', { keepalive: true, credentials: 'omit' })` → rate-limited upsert into `theme_stats_daily` |
| Favourite | optimistic UI → server action → `favorites` row; visitors: localStorage, merged on sign-in |
| Remix save | Studio → `saveRemix` action → private `themes` row (source `remix`, status `draft`); approved creators may later submit through the separate review/publish workflow |
| Creator submit | upload (presign → PUT to R2 → finalize) → create draft → submit → `pending_review` |
| Admin publish | review → `approved` → `POST /api/admin/themes/{id}/publish` → render → R2 → row update (optimistic version check) → revalidate tags |
| Generator | admin action (≤ 24/call) or CLI → specs + QA + duplicate hash → `draft` rows |

---

### 5.1 Studio editor

Studio resolves explicit shared designs before source themes, then a validated local draft, then a freshly generated spec. Invalid explicit entries show a notice and retain a usable generated fallback. The editor validates every change, keeps 50 history entries and coalesces the same control within 400ms; drafts debounce for 500ms and flush before sign-in/navigation. Lock `variant` materializes a calmer copy once, with subsequent home/lock edits independent. Share links use canonical bounded LZ decoding (32KiB expanded JSON, 6,000-character URL) and reject either photo slot. The icon preview cache also includes wallpaper changes when icon fill samples the wallpaper. Mobile panels use a tabbed bottom sheet; desktop panels occupy the end column.

---

## 6. Caching & invalidation (Cache Components)

`next.config.ts` → `cacheComponents: true`. Consequences Copilot must respect:

1. **Public reads** live in `server/queries/*.ts`, each function starts with `'use cache'`, calls `cacheLife(...)` and `cacheTag(...)` from `next/cache`. Arguments are part of the cache key — pass plain serialisable args (e.g. `{ sort, tags, color, cursor }`).
2. Anything that reads `cookies()`, `headers()`, `searchParams`, the session, or the current time outside a cache scope is **dynamic** and must render inside `<Suspense>` with a skeleton fallback. Otherwise the build fails.
3. Route segment configs `dynamic`, `revalidate`, `fetchCache` are not used. `maxDuration` is fine. `dynamicParams = false` does not work with Cache Components — validate params at runtime and call `notFound()`.
4. **Invalidation**: services never call `next/cache`. They return `{ data, tags }`. Callers invalidate:
   - Server Actions → `updateTag(tag)` when the acting user must immediately see their change on a cached page; otherwise `revalidateTag(tag, 'max')`.
   - Route Handlers → `revalidateTag(tag, 'max')` (`updateTag` is Server-Action-only).
   - CLI scripts → `POST /api/internal/revalidate` with `INTERNAL_API_SECRET`.
5. Cache tag registry: pure `lib/cache-tags.ts` (`CacheTags` and tag-shape validation), re-exported by `server/cache.ts` alongside Next invalidation helpers. Services/scripts import the pure registry. Never hand-write tag strings elsewhere. Invalidation matrix: `docs/03` §7.
6. Per-user data (session, favourites, collections, remixes, admin/creator data) is **never** cached in shared caches. Admin and creator reads live in `server/admin-queries/*` (no `'use cache'`).
7. Public API responses set `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`. User endpoints set `Cache-Control: private, no-store`.
8. R2 assets use versioned, immutable keys (`themes/{id}/v{n}/…`, `Cache-Control: public, max-age=31536000, immutable`); a re-render bumps `v{n}`.
9. Credential-free CI builds use curated static params or static shells, never database-defined slug enumeration. Request data children and theme metadata call `connection()` before lazy query imports; cached functions remain independently shared. [Streamed `notFound()`](https://nextjs.org/docs/app/api-reference/file-conventions/not-found) renders not-found UI with `noindex` after headers have flushed, retaining HTTP200; `/api/v1` gives a strict HTTP404. Local theme checks confirmed this behavior even with blocking metadata, so retain default metadata streaming and do not claim strict page status codes for runtime-only database validation.

---

## 7. Database access

- `db` (`drizzle-orm/neon-http`) is the default for every query. No interactive transactions; use `db.batch([...])` for atomic multi-statement writes.
- `dbPool` (`drizzle-orm/neon-serverless` + `Pool`) only for: the Better Auth adapter, the rare interactive transaction, and scripts. Attach `pool.on('error', …)`; set `idleTimeoutMillis: 10_000`. On Vercel, use `attachDatabasePool(pool)` from `@vercel/functions` if the installed version exports it.
- Concurrency control: optimistic — `UPDATE … WHERE id = $1 AND asset_version = $expected`; 0 rows ⇒ `CONFLICT`.
- Counters use single-statement atomic upserts (`ON CONFLICT DO UPDATE SET n = n + 1`), never read-modify-write.
- Migrations: `drizzle-kit generate` → review SQL → `drizzle-kit migrate`. **Never `drizzle-kit push` against a shared database** (it would drop the hand-written trigram indexes). Expand/contract for breaking changes: add → backfill → switch code → remove later.
- `DATABASE_URL` = pooled (runtime). `DATABASE_URL_UNPOOLED` = direct (migrations, scripts).

---

## 8. Auth & sessions

- Better Auth with Drizzle adapter (`dbPool`), Google OAuth + magic link (Resend), `admin` plugin (`role`, `banned`), `nextCookies()` last in plugins. Session cookie cache enabled (5 min) to save DB round trips.
- Roles: `user.role ∈ {'user','admin'}`. **Creator is a capability**, not an auth role: `creator_profiles.status = 'approved'`.
- `proxy.ts` does an **optimistic** check only (session cookie present) for `/admin`, `/creator` and `/account`, including locale-prefixed paths. Real authorisation happens in every Server Action, Route Handler, admin query and page data function (`server/guards.ts`). Layouts are UX, not security.
- Protections: an admin cannot demote or ban themselves; the last admin cannot be demoted.
- Test-only email+password sign-in exists only when `E2E_TEST_AUTH=1`, and env validation refuses that flag when `VERCEL_ENV=production`.

Vibeset's request-cached `getSession()` bypasses the five-minute cookie cache for authorization, so session revocation, bans and role changes take effect immediately. The Better Auth cookie cache remains enabled for its own client session reads. The auth handler and guarded session lookup load validated server configuration at request time, after the dynamic boundary; public shell prerendering does not need server credentials. Serving sign-in or authentication requests still requires valid core server configuration.

Better Auth's `/admin/*` HTTP endpoints are disabled. Role and moderation changes go through Vibeset's guarded services and audit log, preventing alternate plugin endpoints from bypassing its safeguards. The system role-management service serializes role changes with a transaction advisory lock and checks the last-admin invariant before writing the role and audit record in that transaction.

The authentication before-hook also forces authoritative session reads for core account endpoints and refuses banned sessions. Its public `get-session` endpoint retains cookie caching for UI reads; `sign-out` remains available to clear stale or banned sessions. Vibeset guards independently perform fresh session checks before any protected operation.

Better Auth's default session and database rate-limit storage would retain raw IPs. `databaseHooks.session.create.before` hashes the session IP with `sha256(ip + IP_HASH_SALT)`. Its database-backed custom limiter hashes the complete per-IP/path key with the same salt before writing `rate_limit`. The conditional upsert makes the admission decision atomically, preserving Better Auth's rolling inactivity window; a denial-only read computes Retry-After without read-modify-write. IP tracking remains enabled for abuse protection. These callbacks import server-only modules lazily so the auth CLI can load its configuration.

The authenticated Better Auth deletion hook calls `cleanupUserContent(userId)` before deleting the auth user: non-published owned themes are deleted, published themes survive with `owner_id = NULL`, and dependent private records cascade. This hook-specific service returns `void` because it removes private content and does not invalidate shared public cache tags. R2 cleanup is added in P11. Google is omitted until both OAuth credentials are configured; a partial credential pair fails configuration. Magic-link delivery fails explicitly until Resend credentials are provided.

---

## 9. Storage (R2)

| Prefix | Content | Cache |
|---|---|---|
| `themes/{themeId}/v{n}/{attemptId}/` | thumb.webp, preview-home.webp, preview-lock.webp, og.jpg, wallpaper-{phone,tablet,desktop}.jpg | immutable |
| `uploads/incoming/{userId}/{uploadId}` | raw creator upload (presigned PUT) | lifecycle rule: delete after 1 day |
| `uploads/wallpapers/{uploadId}/` | full.jpg (≤ 2868 px tall), preview.webp | immutable |
| `avatars/{userId}/{hash}.webp` | creator avatar | immutable |

- Bucket is served publicly only through the custom domain `cdn.vibeset.app` (Cloudflare caches it; cached hits do not count as R2 reads).
- CORS: `GET` from app origins (client fetches blobs for sharing/canvas), `PUT` from app origins with `Content-Type` header (presigned uploads).
- S3 client: `region: 'auto'`, endpoint `https://{accountId}.r2.cloudflarestorage.com`, `requestChecksumCalculation: 'WHEN_REQUIRED'`, `responseChecksumValidation: 'WHEN_REQUIRED'` (keeps presigned URLs browser-compatible).
- The adapter validates keys/prefixes and caps each object read/write at 32 MiB. Reads are streamed and cancelled on overflow; SDK failures are sanitized. Prefix listing is paginated; deletion drains bounded pages and checks partial failures.
- Presigned PUT cannot enforce size → server `HeadObject` checks size after upload and deletes oversize objects.
- All keys are built by `server/storage/keys.ts`; public URLs by `server/storage/urls.ts` (and `lib/utils` for client CDN URLs). No string-concatenated keys elsewhere.
- Each publish attempt gets a UUID subprefix. Rendering/uploads happen outside a database transaction. A short row-lock transaction verifies the loaded asset version, status and spec hash before updating publication fields and inserting its audit. A concurrent loser can delete only its own attempt prefix; it never deletes the shared version prefix. This also isolates late storage operations after a lost acknowledgement. If database commit outcome is uncertain, preserve uploaded objects rather than risk deleting a committed publication. Retention removes whole versions older than the current and previous versions, after checking current database state.
- Theme/upload/attempt identifiers are UUIDs. Better Auth user identifiers are opaque text, validated as safe path segments rather than forced into UUID format.

---

## 10. i18n

- next-intl v4, locales `en` (default) and `ar`, `localePrefix: 'as-needed'` → `/t/slug` (en) and `/ar/t/slug`.
- Root layout is `app/[locale]/layout.tsx`. `i18n/request.ts` reads the locale with `next/root-params`, accepts an explicit `locale` override (Server Actions/Route Handlers don't support root params yet), validates with `hasLocale`, otherwise `notFound()`. **No `setRequestLocale`.**
- Server Actions return error **codes**; the client translates them (`errors.*` namespace). Actions never need the locale.
- `<html lang dir>`: `dir="rtl"` for `ar`. Chakra `LocaleProvider` set from the locale. Logical properties only (`ms/me/ps/pe`, `insetStart`, `textAlign="start"`); directional icons flip with `_rtl`.
- Numbers: `Intl.NumberFormat('ar-u-nu-latn')` (Latin digits) for consistency with phone UIs.
- DTOs carry both languages (`nameEn`, `nameAr`); components pick with `localized(obj, locale)`. One cache entry serves both locales.

---

## 11. Security

- Headers (in `next.config.ts`): CSP (below), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`.
- CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.vibeset.app https://lh3.googleusercontent.com; connect-src 'self' https://cdn.vibeset.app https://*.r2.cloudflarestorage.com [sentry]; font-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com`.
- Every Server Action and Route Handler: Zod parse → auth guard → rate limit (where listed) → service. Never trust client-sent ids for ownership; re-check in the service.
- SVG is generated only by our renderer from validated specs and displayed via `<img>` (scripts never execute). User SVG uploads are refused.
- Uploads: client re-encodes to JPEG (strips EXIF/GPS), server re-processes with `sharp().rotate()` and strips metadata; type/size/dimension/aspect checks.
- IPs are never stored raw: `sha256(ip + IP_HASH_SALT)`.
- Secrets only in env; `lib/env.server.ts` validates at boot. No secrets in client bundles (`NEXT_PUBLIC_*` only for public values).
- Admin actions write `audit_log`.

---

The CSP uses the validated origin of `NEXT_PUBLIC_CDN_URL` instead of the production CDN origin (default `https://cdn.vibeset.app` when unset). `[sentry]` denotes a future configured Sentry origin and is omitted until enabled. Development alone adds `'unsafe-eval'` to `script-src` and `ws:` / `wss:` to `connect-src` for Next.js debugging and hot reload; production excludes them.

## 12. Observability

- Server errors: `console.error` with a structured object `{ scope, code, message, ids }`; Sentry in P17 (optional).
- `audit_log` for every admin mutation and every theme status transition.
- `generation_runs` for generator history. Publish failures stored in `themes.publish_error`.

---

## 13. Environments

| Env | DB | Storage | Notes |
|---|---|---|---|
| Local | Neon `dev` branch | R2 bucket `vibeset-dev` | `.env.local` |
| Preview (per PR) | Neon branch auto-created by the Vercel integration | `vibeset-dev` | OAuth: test on a stable staging domain, not random preview URLs |
| Production | Neon `main` | `vibeset-assets` + `cdn.vibeset.app` | Vercel Cron enabled |

**Regions**: put the Neon project and the Vercel function region in the same place — e.g. Neon AWS London ↔ Vercel `lhr1`, or Neon AWS Frankfurt ↔ Vercel `fra1` (good for UK + Middle East audiences). A function in the US talking to a database in Europe adds ~80 ms to every uncached query.

---

## 14. Cost model & upgrade triggers

| Service | Plan at launch | Limits that matter | Upgrade when |
|---|---|---|---|
| Vercel | Hobby (non-commercial) | Fair-use limits, daily cron only | Any monetisation, or limits hit → Pro |
| Neon | Free for dev; **Launch (pay-as-you-go) before public launch** | Free: 100 CU-hours/project/month, 0.5 GB storage, 5 GB egress; compute is **suspended** when CU-hours run out | Before launch — a suspended DB takes the site down |
| Cloudflare R2 | Free tier | 10 GB storage, 1M Class A + 10M Class B ops/month, egress free | > 10 GB (~1,700 themes at ~5.8 MB each) |
| Resend | Free tier | Daily send cap | Magic-link volume grows |

Caching (§6) is what keeps Neon cheap: public pages hit the DB only on cache fills.

---

## 15. Decision log

| # | Decision | Rejected alternative | Reason |
|---|---|---|---|
| D1 | Next.js 16 (≥ 16.3) | Next 14 | 14 is EOL; tyrerescue already runs 16 |
| D2 | Cache Components on | Classic ISR + `unstable_cache` | Explicit caching fits a content-heavy, mostly-static site |
| D3 | Better Auth | NextAuth v5 beta | Maintainers recommend Better Auth for new projects; admin/ban built in |
| D4 | Drizzle stable | Drizzle 1.0 RC | Production stability; RC upgrade path exists |
| D5 | Cloudflare R2 | Vercel Blob | Zero egress for a download-heavy free app |
| D6 | resvg + sharp | Puppeteer/Satori | Speed, determinism, no browser in functions |
| D7 | Web-first, native widgets Phase 2 | Native app first | Validates content & SEO cheaply; web cannot do widgets anyway |
| D8 | Shortcuts wizard | Config-profile web clips | Web clips open Safari first + "Unverified" install friction |
| D9 | Generic glyphs | Brand logos | No trademark exposure |
| D10 | No TanStack Query | TanStack Query | Few client fetches; explicit hooks with AbortController suffice |
| D11 | Language-neutral server previews | Per-locale previews | Half the storage and render time |
