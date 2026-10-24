---
description: 'P14 · Admin operations — generator UI, collections, tags, app catalogue, reports, users, creators, settings, audit'
agent: 'agent'
---

# P14 · Admin operations

Read first: [API §1, §4 (admin), §7–§9](../../docs/03-api-and-permissions.md) · [content pipeline §2, §10–§14](../../docs/05-content-pipeline.md) · [data model §6](../../docs/02-data-model.md)

## Goal

Every content and community operation is possible from the admin UI — no database console needed for day-to-day running.

## Tasks

1. **Generator** — `admin/generator/page.tsx`: aesthetic select (shows existing counts per status), count 1–24, seed (random button), "Generate" → `adminGenerateDrafts` (route segment `export const maxDuration = 60`) → result card (created / duplicates / QA skips) with "Review these" link (`/admin/review?run=<id>`). Runs history table (`generation_runs`: date, aesthetic, seed, counts, actor, status, expandable log).

2. **Collections** — `admin/collections/page.tsx` and `admin/collections/[id]/page.tsx`:
   - List editorial + seasonal (pinned, window, item count).
   - Form: slug (validated; warn when changing a public collection's slug), kind, visibility (public/private), titles EN/AR, descriptions, cover theme picker, pinned, sort order, `starts_at`/`ends_at` for seasonal (validated window).
   - Items: theme search picker (published only), drag reorder (`Reorder.Group`), remove; actions in `server/actions/admin/collections.ts`; invalidate `collections` + `collection:{slug}` (old and new slug on rename).

3. **Tags** — `admin/tags/page.tsx`: grouped by kind; create/edit (slug, names EN/AR, descriptions, sort order, active); **merge** (`from → to`: same kind, active target, move `theme_tags` with conflict-safe insert, delete `from`, rebuild `tags_text` for affected themes in batches, audit); delete (blocked while used unless "remove from N themes" confirmed). Used aesthetic tags must merge rather than be removed, and used tags cannot change kind. Seeded recipe tag slugs/kinds are fixed and cannot be deleted or merged away, preserving generator identities; labels, descriptions, ordering and activation remain editable. Invalidate `taxonomy` + `themes`.

4. **App catalogue** — `admin/apps/page.tsx`: searchable table; create/edit (name, slug, aliases chips, category, glyph via `GlyphPicker` with live icon preview in a sample theme style, optional `ios_scheme`, `android_package`, rank, active); "Move to top 24" helper; validation that the glyph exists in the manifest. Invalidate `apps`.

5. **Reports** — `admin/reports/page.tsx`: open first, then resolved/dismissed tabs; detail drawer with theme preview, reason/details, reporter (user email masked or "anonymous"), other reports for the same theme; actions `dismiss`, `archive_theme`, `ban_owner` (+ note) via `adminResolveReport` (archive uses `transitionThemeStatus`; ban uses the users service).

6. **Users** — `admin/users/page.tsx`: search (email/name), filters (role, banned, creator status), paginated; detail drawer: profile, counts (favourites, collections, remixes, themes), set role, ban/unban with reason and "archive their published themes" option. Extend the existing transaction-based `server/services/users.ts`: re-check current admin/ban state, serialize role changes with the existing advisory lock, and atomically audit changes. Preserve its CLI contracts. Better Auth admin HTTP endpoints stay disabled, and services do not import `next/*`. Enforce: cannot change own role/ban self, last admin cannot be demoted or banned. Revoke affected sessions and keep fresh request guards authoritative.

7. **Creators** — `admin/creators/page.tsx`: pending applications queue (handle, bio, links, 18+ confirmation, account age) → approve / reject (reason) / later suspend; approved creators list with theme counts and 30-day downloads. `adminReviewCreator` → `creators.review` → invalidate `creator:{handle}`; suspension optionally archives their published themes.

8. **Settings** — `admin/settings/page.tsx`: forms for `home.hero` (collection select), `home.announcement` (enabled, texts EN/AR, link, tone, live banner preview in both directions), `features` switches. `server/services/settings.ts` gains `updateSetting(key, value, actor)` (Zod per key, audit); action invalidates `settings`.

9. **Audit log** — `admin/audit/page.tsx`: filters (actor, action prefix, entity type/id, date range), paginated, JSON meta viewer, links to entities.

10. **Messages**: `admin.*` additions (EN + AR).

11. **Tests**: tag merge correctness + `tags_text` rebuild (integration); role protections (self, last admin); settings validation per key; collection window validation; generator action respects count limit and admin-only.

## Acceptance checks

- [ ] Generate 12 Y2K drafts from the UI, review them in the deck, publish from the queue — end to end without the terminal.
- [ ] Seasonal collection with a window shows on Home only inside the window.
- [ ] Merging two tags updates Explore filters and search results after invalidation.
- [ ] Banning a user blocks their next request; their themes archive when chosen; audit shows everything.
- [ ] Announcement banner appears in both languages after saving.
- [ ] tests, typecheck, lint, build pass; `/review` reports no blockers.

## Finish

Commit: `P14: admin operations`.
