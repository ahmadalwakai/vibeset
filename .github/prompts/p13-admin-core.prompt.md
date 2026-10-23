---
description: 'P13 · Admin core — admin shell, dashboard, themes table with bulk actions, theme editor, review deck, publish queue'
agent: 'agent'
---

# P13 · Admin core

Read first: [product §6 (Admin)](../../docs/00-product.md) · [API §1, §4 (admin), §8](../../docs/03-api-and-permissions.md) · [data model §7](../../docs/02-data-model.md) · [design system §7–§9](../../docs/04-design-system.md)

## Goal

The owner can review hundreds of themes quickly, fix them, and publish safely — from a phone or a laptop.

## Tasks

1. **Shell** — `app/[locale]/admin/layout.tsx`: `requireAdminPage()` inside Suspense; `components/layout/AdminShell.tsx` (sidebar 248 px lg+, drawer below): Dashboard, Review, Publish queue, Themes, Generator, Collections, Tags, Apps, Reports, Users, Creators, Settings, Audit. Badges (pending review, open reports, pending creators) from `server/admin-queries/counts.ts` in their own Suspense. `robots: noindex` on all admin pages. Remove the P03 stub page.

2. **Dashboard** — `admin/page.tsx`: `StatCard`s (published, pending review, approved-not-published, stale, downloads today/7d/30d, new users 7d, open reports, pending creators), `DownloadsChart` (30 days, Recharts in a client component, dynamic import), top 10 themes (7d downloads), recent audit entries. Each block in its own Suspense with skeletons. Queries in `server/admin-queries/dashboard.ts` (call `requireAdmin()` first).

3. **Themes table** — `admin/themes/page.tsx`:
   - Server-side pagination (50/page, offset), filters in the URL (status, source, aesthetic, colour, featured, stale, generation run, q), sort (updated, published, popularity, downloads).
   - `components/admin/DataTable.tsx` (generic, typed columns, row selection, card layout below md).
   - Bulk actions via Chakra `ActionBar`: approve, reject (reason dialog with quick picks), archive, feature/unfeature, add/remove tags, add to collection, delete (typed confirm). Actions in `server/actions/admin/themes.ts` (`adminTransitionThemes`, `adminSetFeatured`, `adminTagThemes`, `adminAddToCollection`, `adminDeleteThemes`) — per-item results; the UI shows "18 updated, 2 failed (reason)".

4. **Theme editor** — `admin/themes/[id]/page.tsx` (any status):
   - Live preview (client renderer) with Home/Lock/Icons tabs.
   - Tabs: **Visual** (reuse `StudioShell` in admin mode) · **Details** (names EN/AR, descriptions, tags with exactly one aesthetic, featured) · **JSON** (spec textarea with format + Zod validation errors with paths) · **History** (audit entries for this theme) · **Stats** (30-day chart).
   - Status panel: current status, `allowedTransitions(status, adminActor)` buttons, rejection reason input, **Publish / Re-render** (calls `POST /api/admin/themes/[id]/publish`; shows `publish_error` if any), stale indicator (`assets_spec_hash ≠ spec_hash`).
   - `adminUpdateTheme` returns `{ stale }`; slug is read-only once published.

5. **Review deck** — `admin/review/page.tsx` + `components/admin/ReviewDeck.tsx`:
   - Queue: `pending_review` first (creator submissions), then generated `draft`s (filter by aesthetic and generation run). Loaded in pages of 30 (`server/admin-queries/review.ts`), prefetch next page.
   - Card: large client-rendered Home + Lock previews and a row of 8 icons; name, aesthetic, source, creator; QA badges (min icon contrast via `qaSpec`; nearest duplicate distance computed server-side from `preview_hash` — "Looks like {name} (distance 5)").
   - Keyboard: **A** approve, **R** reject (opens quick reasons: low quality, duplicate, off-aesthetic, low contrast, inappropriate, other), **S** skip, **F** toggle featured, **←/→** navigate, **Z** undo the last decision within 5 s (decisions are sent after the undo window). Shortcuts shown with `Kbd`, `aria-keyshortcuts`; swipe gestures on mobile (right approve, left reject).
   - "Approve & publish" option queues approved ids into the publish queue.

6. **Publish queue** — `admin/publish/page.tsx` + `components/admin/PublishQueue.tsx`:
   - Lists approved (never published), stale published, archived-to-republish, failed (`publish_error` set).
   - Select → "Publish N": client orchestrator with concurrency 2 calling the publish route; per-item status (queued, rendering, done, skipped, failed + error), retry failed, pause/resume, cancel; survives route changes within admin (state in a context) and warns before closing the tab while running.

7. **Admin queries/actions**: everything in `server/admin-queries/*` and `server/actions/admin/*` calls `requireAdmin()`; every mutation writes audit and invalidates tags per `docs/03` §7 (actions use `updateTag`).

8. **Messages**: `admin.*` (EN + AR — the admin is bilingual too).

9. **Tests**
   - Table-driven: every exported admin action called with a visitor, a user, a creator → `UNAUTHENTICATED`/`FORBIDDEN`.
   - Bulk transition with mixed valid/invalid items returns per-item results and only valid ones change.
   - Review deck reducer (decisions queue, undo window) as a pure module.

## Acceptance checks

- [ ] Review 50 generated drafts in under 5 minutes using only the keyboard; undo works.
- [ ] Publish queue publishes 20 themes with progress and recovers from a forced failure (e.g. kill network) via retry.
- [ ] Editing a published theme marks it stale; re-render publishes the new version and the public page updates.
- [ ] Mobile admin is usable (cards, drawer nav, swipe review).
- [ ] Non-admins can't reach any admin page or action (404 / FORBIDDEN).
- [ ] tests, typecheck, lint, build pass.

## Finish

Commit: `P13: admin core`.
