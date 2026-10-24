---
description: 'P08 · Theme page — detail layout, SEO/JSON-LD, wallpaper download sheet, share, view tracking, in-app-browser banner'
agent: 'agent'
---

# P08 · Theme detail & wallpaper download

Read first: [install flows §1–§3.1, §7](../../docs/06-install-flows.md) · [design system §7](../../docs/04-design-system.md) · [API §5](../../docs/03-api-and-permissions.md) · [UI rules](../instructions/ui.instructions.md)

## Goal

A fast, beautiful theme page where anyone can save the wallpaper to their phone in two taps, on iPhone, Android and desktop.

## Tasks

1. **Client platform helpers** — `lib/client/platform.ts`, `lib/client/share.ts`, `lib/client/track.ts` exactly per `docs/06` §1, §2, §7 (`IOS_SHARE_BATCH = 20`, two-step share, error handling, credential-free keepalive fetch). `hooks/usePlatform.ts` (resolves after mount to avoid hydration mismatch).

2. **Track endpoint** — `app/api/track/route.ts`: bounded JSON and Zod body `{ themeId: uuid, event }`; rate limit `track:{ipHash}` 120/60 s (return 204 even when limited — don't leak). A single atomic SQL CTE locks the published theme row, upserts the UTC `theme_stats_daily` event delta, and increments `themes.download_count` only for downloads. This serializes eligibility with archival instead of trusting a stale cached lookup. Respond 204, `Cache-Control: no-store` for accepted, limited and unpublished events; never read cookies or sessions.

3. **Page** — `app/[locale]/(site)/t/[slug]/page.tsx`:
   - Omit DB-backed `generateStaticParams` to retain credential-free CI builds; render a static shell and load cached theme content after request-time `connection()` before the lazy query import. Unknown/unpublished slug → `notFound()`. Do not export an empty `generateStaticParams`, which Cache Components rejects.
   - `generateMetadata`: localized title/description, canonical, `alternates.languages`, Open Graph (`og.jpg`, 1200×630), Twitter `summary_large_image`, `robots` index.
   - JSON-LD `<script type="application/ld+json">` (`CreativeWork`: name, image (previewHome), keywords (tags), `isAccessibleForFree: true`, `dateModified`, `creator` when present). Serialise with `JSON.stringify` and escape `<` (prevent script breakout).
   - Layout per `docs/04` §7: `PreviewCarousel` (scroll-snap Home/Lock images, dots, swipe, RTL-safe; first image `fetchPriority="high"`), info block (name, creator link, tag chips → `/explore?tags=`, stats with `formatCompact`), `ThemeActionBar`, "More like this" `HorizontalRail` (Suspense + skeleton).
   - `components/theme/ThemeActionBar.tsx` (client): sticky bottom on mobile (safe area, glass), inline on md+. Buttons now: **Download** (opens `WallpaperDownloadSheet`), **Remix** (link `/studio?from={slug}`), overflow menu with **Share** (Web Share URL, fallback copy link + toast). Accept optional `iconsAction`, `favoriteAction` and `reportAction` props — P09 and P11 fill them. Never render disabled placeholder buttons.

4. **Wallpaper download** — `components/theme/WallpaperDownloadSheet.tsx` (client, loaded with `next/dynamic` on first open):
   - Size options from `ThemeDetailDTO.wallpapers` (phone/tablet/desktop with dimensions + file size); default by platform (iPad → tablet, desktop → desktop, else phone).
   - On open/selection: prefetch the file as a `Blob` (`fetch(url, { mode: 'cors' })`, AbortController on change/close) → `File` named `vibeset-{slug}-{size}-{w}x{h}.jpg`. Show progress state while preparing.
   - Primary button: iOS → "Save to Photos" (`shareFiles` inside the click); Android → share if `canShareFiles` else download; desktop → download.
   - After success: `track('download')` once, then platform-specific "Set it as wallpaper" steps (from `docs/06`), link to `/setup/ios` on iOS.
   - Errors: network → retry; share `NotAllowedError` → "Tap Save again"; `AbortError` → nothing.

5. **In-app browser banner** — `components/common/InAppBrowserBanner.tsx`: shown on theme pages and Studio when `isInAppBrowser()`; copy link button + short illustrated instruction; dismissible for the session. Recorded menu media is a P17 content task; do not reference nonexistent GIF assets.

6. **View tracking** — `components/theme/TrackView.tsx` (client): once per session per theme (`sessionStorage` key) → `track('view')`.

7. **Messages**: `theme.*` (actions, sizes, steps per platform, errors) in EN + AR.

8. **Tests**: `share.ts` decision logic (pure function `chooseSaveStrategy(platform, canShare)`), `chunk()` util, JSON-LD escaping, track route validation (unit with mocked db).

## Acceptance checks

- [ ] Real iPhone (Safari): Download → Save to Photos → image appears in Photos at full resolution.
- [ ] Android Chrome: share or download works; desktop: file downloads with the right name.
- [ ] Draft/archived slugs render not-found/noindex; the API returns HTTP404. Static shells remain buildable without database credentials; cached theme content loads at request time. Next retains HTTP200 when runtime not-found happens after streaming begins (verified locally, including a blocking-metadata experiment).
- [ ] Social preview validators show the OG image and title.
- [ ] In-app browser (Instagram/TikTok) shows the banner.
- [ ] `theme_stats_daily` increments for view/download; rate limit returns 204 silently.
- [ ] tests, typecheck, lint, build pass.

## Finish

Commit: `P08: theme page & wallpaper download`.
