---
description: 'P15 · SEO, PWA, performance & daily jobs — metadata audit, sitemap/robots/JSON-LD, manifest, perf budgets, daily cron'
agent: 'agent'
---

# P15 · SEO, PWA, performance & daily jobs

Read first: [quality checklists §4–§5](../../docs/08-quality-checklists.md) · [architecture §6, §14](../../docs/01-architecture.md) · [API §5](../../docs/03-api-and-permissions.md)

## Goal

Every public page is discoverable in both languages, the app installs cleanly, budgets are met on a mid-range phone, and popularity/counters stay correct automatically.

## Tasks

1. **Metadata audit** — every page has translated `title`/`description`, canonical, `alternates.languages` (`en`, `ar`, `x-default`), OG + Twitter images (theme pages use `og.jpg`; others a static brand OG in `public/og/`). `robots: { index: false }` for `/saved`, `/account`, `/creator/**`, `/admin/**`, `/collections/u/**`, `/sign-in`, Studio with `?s`, `/dev/**`.

2. **Sitemap & robots**
   - `app/sitemap.ts` — static pages, aesthetic pages, editorial/seasonal collections, published themes (`lastModified` = `updated_at`), approved creators; each entry with `alternates.languages` for en/ar. Use `generateSitemaps` to split at 40,000 URLs. Data via a cached query (tag `themes`).
   - `app/robots.ts` — allow `/`, disallow `/admin`, `/creator`, `/account`, `/saved`, `/api`, `/dev`; sitemap URL.

3. **Structured data** — `components/seo/JsonLd.tsx` (safe serialiser, escapes `<`): `Organization` + `WebSite` with `SearchAction` (`/explore?q={search_term_string}`) on Home; `CreativeWork` on theme pages (P08 — verify); `CollectionPage` + `ItemList` on aesthetic and collection pages; `BreadcrumbList` on theme/aesthetic/collection pages.

4. **PWA** — `app/manifest.ts`: name "Vibeset", short_name "Vibeset", description, `start_url: '/'`, `display: 'standalone'`, `background_color` `#faf8fc`, `theme_color` `#b44bd0`, icons 192/512 + maskable 512 (`public/icons/`, exported from the brand mark), shortcuts (Explore, Studio, Saved), categories `['personalization', 'lifestyle']`. `app/icon.png` + `app/apple-icon.png`. **No service worker in v1** (avoids stale-cache bugs on a content site; revisit with a measured need).

5. **Performance pass** (production build, mid-range Android + iPhone):
   - Confirm heavy modules are only in the chunks that need them (renderer, `fflate`, `lz-string`, `culori`, Recharts): inspect `next build` output / browser coverage, fix leaks with `next/dynamic` or `import()`.
   - Images: correct `width`/`height`, first-row priority only, lazy elsewhere, thumbnails ≤ 80 KB.
   - Fonts: only body + display preloaded; preview fonts `preload: false`.
   - Client components: move static parts back to Server Components where possible.
   - Grid: `contentVisibility: 'auto'` + `containIntrinsicSize` on cards.
   - Database: run `EXPLAIN ANALYZE` for each `listThemes` variant with ≥ 1,000 themes (seed more drafts and publish if needed) — every list query must use an index (partial published indexes, GIN search, trigram). Record results in `docs/01` §6 notes.
   - Optional enhancement: React 19.2 `<ViewTransition>` for card → theme page thumbnail morph behind `experimental.viewTransition`; must degrade gracefully and respect reduced motion.

6. **Daily job** — `app/api/cron/daily/route.ts` (`Authorization: Bearer ${CRON_SECRET}`, `maxDuration = 60`) calling `server/services/maintenance.ts`:
   - `recomputePopularity()` — one SQL statement over published themes: `score = Σ_{last 30 days} (downloads×3 + icon_exports×3 + remixes×4 + setup_completions×5 + views×0.2) × 0.9^(age_days) + 10 × 0.8^(days_since_publish)`; themes without stats get only the freshness term.
   - `reconcileCounters()` — `favorite_count` from `favorites`, `download_count` from all-time `theme_stats_daily.downloads`.
   - `cleanup()` — delete `app_rate_limits` rows older than 2 days; mark `uploads` pending > 24 h as `rejected` (R2 lifecycle removes incoming objects).
   - Then `revalidateTag('themes', 'max')`. Log a one-line summary.
   - `vercel.json`: `{ "crons": [{ "path": "/api/cron/daily", "schedule": "17 3 * * *" }] }`.
   - Tests: popularity SQL on a fixture (integration), auth header required.

7. **Analytics (optional, privacy-safe)**: Vercel Web Analytics / Speed Insights are cookieless — allowed. No third-party trackers or ad pixels (UK Children's Code).

## Acceptance checks

- [ ] Lighthouse mobile on Home, Explore, Theme page, Studio: Performance ≥ 90, Accessibility ≥ 95, SEO 100, Best Practices ≥ 95.
- [ ] `/sitemap.xml` (and split sitemaps) list en + ar alternates; `/robots.txt` correct; Rich Results Test passes for a theme page.
- [ ] Installing the PWA on iPhone and Android shows the right icon, name and theme colour.
- [ ] Calling the cron with the secret updates popularity; Trending order changes accordingly after revalidation; without the secret → 401.
- [ ] tests, typecheck, lint, build pass.

## Finish

Record Lighthouse scores and EXPLAIN findings in the summary. Commit: `P15: seo, pwa, performance & daily jobs`.
