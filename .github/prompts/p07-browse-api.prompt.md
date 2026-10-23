---
description: 'P07 · Browse & public API — DTOs, cached queries, Home, Explore, aesthetic/collection/creator pages, /api/v1'
agent: 'agent'
---

# P07 · Browse & public API

Read first: [API §3–§5, §7](../../docs/03-api-and-permissions.md) · [architecture §5–§6](../../docs/01-architecture.md) · [design system §6–§9](../../docs/04-design-system.md) · [UI rules](../instructions/ui.instructions.md) · [server rules](../instructions/server.instructions.md)

## Goal

Fast, cached, beautiful browsing for everyone, and the stable public API that the Phase 2 app will use.

## Tasks

1. **Contracts**: `lib/dto.ts` exactly as `docs/03` §3.3; `lib/utils/cursor.ts` (`encodeCursor`, `decodeCursor` with Zod, offset variant); `lib/validation/themes.ts` → `themeListQuerySchema` (parses URL search params: `q`, `tags` comma list ≤ 5, `color`, `sort` default `trending`, `cursor`, `limit` 1–48 default 24, `ids` comma list ≤ 100).

2. **Mappers** — `server/queries/mappers.ts`: `toThemeCard(row)`, `toThemeDetail(row)`, `toCollectionCard`, `toTag`, `toApp`. URLs via `cdnUrl`. One place only.

3. **Cached queries** (`'use cache'` + `cacheLife` + `cacheTag`; `status = 'published'` always):
   - `server/queries/themes.ts`: `listThemes(query)` (tags `themes`; `cacheLife('hours')`) implementing sort cursors (`trending` = popularity, `new` = published_at, `popular` = download_count, tie-break id), tag AND filter (`HAVING count(DISTINCT tag) = n`), colour filter, search (`websearch_to_tsquery('simple', q)` OR trigram similarity > 0.25 on names; ranked; offset cursor capped at 200), `ids` mode (keeps input order); `getThemeDetail(slug)` (tags `themes`, `theme:{slug}`; returns null if not published); `getRelatedThemes({ themeId, aestheticSlug, limit: 12 })`; `getTopThemeSlugs(limit)` for static params.
   - `server/queries/taxonomy.ts`: `listTags(kind?)`, `getAestheticTag(slug)` (tags `taxonomy`; `cacheLife('days')`).
   - `server/queries/collections.ts`: `listPublicCollections()`, `getHomeCollections()` (pinned editorial + seasonal whose window contains "now" — compute `new Date()` inside the cached function, `cacheLife('hours')`), `getCollection(slug, cursor)` (tags `collections`, `collection:{slug}`).
   - `server/queries/settings.ts`: `getPublicSettings()` → `{ announcement, heroCollectionSlug }` (tag `settings`).
   - `server/queries/creators.ts`: `getCreatorPublic(handle)` (approved only; tag `creator:{handle}`).
   - `server/queries/apps.ts`: `listApps()` (tag `apps`, `cacheLife('days')`).

4. **API v1** (`app/api/v1/…/route.ts`, `handleRoute`, Zod parse, `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`): `themes`, `themes/[slug]`, `collections`, `collections/[slug]`, `tags`, `apps` — exactly `docs/03` §5. Unknown slug → 404 JSON.

5. **Components**
   - `components/theme/ThemeCard.tsx` — link card (AspectRatio 9/19.5, `rounded="card"`, `bg={dominantColor}` placeholder, image lazy except `priority` prop, localized name, up to 2 tag chips, creator handle when present), hover/press per `docs/04` §6, `actions?: ReactNode` slot rendered absolutely at the top-end corner **outside** the link element.
   - `ThemeGrid.tsx` (StaggerGrid, first row priority), `ThemeGridSkeleton.tsx`, `HorizontalRail.tsx` (scroll-snap row, works in RTL, arrow buttons on md+), `TagChip.tsx`, `ColorDot.tsx`, `CollectionCard.tsx`, `components/layout/AnnouncementBanner.tsx` (dismissible per announcement id in `localStorage`).
   - `components/explore/`: `SearchInput` (debounced 300 ms, `router.replace` with `scroll: false`, clear button, autofocus when `?focus=1`), `FilterBar` (md+ inline chips grouped by kind: aesthetic, mood, season, style + colour dots), `FilterSheet` (mobile `ResponsiveSheet` with the same groups, apply/reset, active count badge), `SortMenu`, `ActiveFilters` (removable chips), `InfiniteThemeGrid` (client).
   - `hooks/useInfiniteThemes.ts` — key = serialised query; on key change: abort in-flight request, reset list to the server-rendered first page; `loadMore()` guarded against concurrent calls; dedupe by id; request-id check to ignore stale responses; `error` + `retry()`; `hasMore`.

6. **Pages** (`app/[locale]/(site)/…`):
   - `page.tsx` **Home** (replace P02's temporary page): hero (hero collection or brand hero with gradient sparkle), "Trending" rail, "New" rail, aesthetic chips (links to `/a/[slug]`), active seasonal collection rail, "Make your own" Studio CTA. Each section its own component; metadata translated.
   - `explore/page.tsx` — static header + `FilterBar`; results in `<Suspense fallback={<ThemeGridSkeleton />}>` (awaits `searchParams`, parses with the schema, calls `listThemes`, renders first page + `InfiniteThemeGrid`). Empty state with "clear filters" + popular aesthetics; invalid params → normalised redirect.
   - `a/[slug]/page.tsx` — aesthetic landing: `generateStaticParams` from aesthetic tags; title/description (EN/AR); grid sorted by trending; 404 if not an aesthetic tag; metadata + canonical.
   - `collections/page.tsx`, `collections/[slug]/page.tsx` — editorial/seasonal only (user collections come in P11).
   - `c/[handle]/page.tsx` — creator profile (avatar, display name, bio, links with `rel="nofollow ugc noopener"`, their published themes).
   - Add `AnnouncementBanner` to the site shell (reads `getPublicSettings()` inside Suspense).

7. **Messages**: `home.*`, `explore.*`, collections and creator strings (EN + AR).

8. **Tests**: `themeListQuerySchema` (normalisation, limits, invalid colour), cursor round-trip + tamper → error, mappers (null assets → null URLs), `useInfiniteThemes` reducer logic (pure part extracted to `hooks/infinite-themes-state.ts`).

## Acceptance checks

- [ ] Home and Explore render from cache (DB not hit on reload — verify with Neon monitoring or query logging in dev).
- [ ] Filters + search + sort update the URL and results; back/forward restores state; infinite scroll has no duplicates or skipped items; changing filters mid-load never shows stale results.
- [ ] RTL: rails scroll correctly, arrows flipped, chips aligned.
- [ ] `/api/v1/themes?sort=new&limit=5` returns the documented shape; `ids=` keeps order; cache headers present.
- [ ] Lighthouse mobile (prod build): Performance ≥ 90, Accessibility ≥ 95 on Home and Explore.
- [ ] tests, typecheck, lint, build pass.

## Finish

Commit: `P07: browse & public API`.
