---
description: 'P11 · User features — favourites (local + synced), collections, Saved page, account settings, export/delete, reports'
agent: 'agent'
---

# P11 · User features

Read first: [API §1, §4, §9](../../docs/03-api-and-permissions.md) · [design system §6, §9](../../docs/04-design-system.md) · [server rules](../instructions/server.instructions.md) · [UI rules](../instructions/ui.instructions.md)

## Goal

Visitors and users can keep what they like (favourites, collections, remixes), manage their account and report problems — consistent across devices, with instant optimistic UI.

## Tasks

1. **Favourites**
   - `server/services/favorites.ts`: `toggleFavorite(userId, themeId)` — serialized transaction: acquire a per-user/theme advisory lock in a preceding statement, then `DELETE … RETURNING` and, if nothing deleted, `INSERT … ON CONFLICT DO NOTHING` at a fresh READ COMMITTED snapshot (theme must be published). A single-statement toggle alone can lose simultaneous toggles when both snapshots see no row; `mergeLocalFavorites(userId, ids)` (filter to published, bulk insert on conflict do nothing); `listFavoriteIds(userId)`.
   - `server/actions/favorites.ts` (`createAction`, auth `user`, rate limits per `docs/03`).
   - `app/api/me/favorites/route.ts` — `{ themeIds }`, `private, no-store`, 401 for visitors.
   - `components/theme/FavoritesProvider.tsx` (client context in the site layout): visitors → ids in `localStorage` (`vibeset:favorites`, Zod-validated on read); users → fetch `/api/me/favorites` once after hydration; on sign-in detection (session changes from null to user) → `mergeLocalFavorites(local)` → clear local → refresh ids. Exposes `isFavorite(id)`, `toggle(id)`, `status`.
   - `components/theme/FavoriteButton.tsx`: optimistic toggle, heart pop + burst animation (`docs/04` §6), `aria-pressed`, translated label; visitors get a one-time toast "Saved on this device — sign in to sync". Pass it into `ThemeCard` `actions` and `ThemeActionBar` `favoriteAction`.

2. **Collections**
   - `lib/validation/collections.ts`, `server/services/collections.ts` (create, update, delete, add, remove, reorder — owner checks in the service; positions rewritten in one `db.batch`; `item_count` computed in queries).
   - `server/actions/collections.ts`.
   - `components/theme/SaveToCollectionSheet.tsx`: user's collections with checkboxes (optimistic), inline "New collection"; reachable from the theme page overflow and from card long-press/menu on md+.
   - `app/[locale]/(site)/collections/u/[id]/page.tsx`: owner (edit title/visibility, reorder with `Reorder.Group` from `motion/react`, remove) or anyone when `unlisted` (read-only); `robots: noindex`; private + not owner → 404. Dynamic (no shared cache).

3. **Saved page** — `app/[locale]/(site)/saved/page.tsx` (not gated): tabs **Favourites** (visitors: local ids resolved via `/api/v1/themes?ids=`; users: server ids), **Collections** (users; visitors see a sign-in prompt), **Remixes** (users: list from `server/admin-queries/user.ts` → `listMyRemixes`, open in Studio, delete with confirm). Empty states with actions.

4. **Account** — `app/[locale]/(site)/account/page.tsx` (`requireUserPage`):
   - Profile: name, preferred language (updates Better Auth `locale` via `updateAccount` action; switching also navigates to that locale), colour mode.
   - **Export my data**: `app/api/account/export/route.ts` → JSON attachment (`Content-Disposition`) with profile, favourites, collections (+ items), remixes (specs), creator profile + theme metadata; rate limit 5/day.
   - **Delete account**: `ConfirmDialog` requiring the typed word (`DELETE` / `حذف`) → `authClient.deleteUser()` → signed out by Better Auth’s successful deletion → home + toast. Do not issue a second sign-out that could affect a newly switched account.
   - Extend `cleanupUserContent(userId)` (P01) to also delete the user's R2 objects: unused uploads (`uploads` rows' keys, preserving original photos referenced by surviving anonymous published designs) and asset prefixes of the deleted non-published themes (use `after()` where available; failures logged, never block deletion).

5. **Reports**
   - `lib/validation/reports.ts`, `server/services/reports.ts` (`submitReport`: theme must be published; stores `reporter_id` or `reporter_ip_hash`; duplicate open report from the same reporter for the same theme → return the existing id), `server/actions/reports.ts` (auth `public`, rate limit 5/h per user-or-ip, feature `reportsEnabled`).
   - `components/theme/ReportDialog.tsx` (reason radio group, details ≤ 1000 with counter, success state "Thanks — we'll review it"); wired via `ThemeActionBar` `reportAction`.

6. **Messages**: `saved.*`, `account.*`, report strings (EN + AR).

7. **Tests**: toggle idempotency and published-only rule (integration), merge filters unpublished ids, collection ownership (other user → `FORBIDDEN`), reorder keeps positions contiguous, report de-duplication, export JSON shape.

## Acceptance checks

- [ ] Visitor favourites persist across reloads; after sign-in they merge into the account (no duplicates) and appear on another device.
- [ ] Optimistic heart rolls back with a toast when offline.
- [ ] Collections CRUD + reorder + unlisted link in a private window; private link → 404 for others.
- [ ] Export downloads valid JSON; delete account removes data and signs out.
- [ ] Report flow works for visitors and users; rate limit message shown on spam.
- [ ] Regression: Explore/Theme/Studio unaffected (run `/review`).
- [ ] tests, typecheck, lint, build pass.

## Finish

Commit: `P11: user features`.
