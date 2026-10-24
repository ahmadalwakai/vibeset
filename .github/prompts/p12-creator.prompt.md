---
description: 'P12 · Creator — application, creator area, photo uploads with palette extraction, theme authoring, submission, stats'
agent: 'agent'
---

# P12 · Creator tools

Read first: [content pipeline §12](../../docs/05-content-pipeline.md) · [API §1, §4 (creator)](../../docs/03-api-and-permissions.md) · [data model §7](../../docs/02-data-model.md) · [architecture §9, §11](../../docs/01-architecture.md)

## Goal

Approved creators (18+) can upload their own wallpaper, build a full theme around it with the Studio, submit it for review, fix rejections and watch their stats.

## Tasks

1. **Application** — `app/[locale]/(site)/become-creator/page.tsx` (`requireUserPage`):
   - Explainer (what creators get, rules: own your images, no brands/celebrities/characters, 18+).
   - Form: handle (lowercase `^[a-z0-9_]{3,24}$`, live availability via a `checkHandle` action, debounced 400 ms), display name, bio ≤ 280, up to 3 links (https only), 18+ checkbox (required). Feature flag `creatorApplicationsOpen` → closed state.
   - Status views: pending, rejected (reason + edit & re-apply), approved (link to `/creator`), suspended (reason, no self re-application).
   - `server/services/creators.ts`: `apply`, `checkHandle`, `updateProfile`, `review` (used by admin in P14), `getCreatorContext(userId)`; `server/actions/creator.ts` for user/creator actions.

2. **Creator area** — `app/[locale]/creator/layout.tsx`: `requireCreatorPage()` inside Suspense; `components/layout/CreatorShell.tsx` (sidebar lg+, drawer mobile): Dashboard, My themes, New theme, Profile, "View public page".
   - `creator/page.tsx` dashboard: status counts, 7d/30d views/downloads/icon exports/remixes/setup completions (sum of `theme_stats_daily` for own themes — `server/admin-queries/creator.ts`), current favourites (separate current-count metric, no historical favourites column), top 5 themes, latest rejection reasons.
   - `creator/themes/page.tsx`: tabs by status, cards with actions (edit, submit, withdraw, delete with confirm), rejection reason inline.

3. **Uploads**
   - Client: `lib/client/prepare-upload.ts` — decode (`createImageBitmap`, HEIC works in Safari), longest edge ≤ 3000 px, JPEG q0.92 (strips EXIF/GPS), returns `{ blob, width, height }`; reject < 1080×1920 or aspect outside 0.4–0.7 with a translated reason before uploading.
   - `components/creator/WallpaperUploader.tsx` — Chakra `FileUpload`; steps: prepare → `createWallpaperUpload` → `PUT` with `XMLHttpRequest` (upload progress) using the returned headers → `finalizeWallpaperUpload` → preview + extracted palette. Cancel aborts XHR. Errors mapped to `UPLOAD_INVALID` reasons (`too_small`, `bad_aspect`, `too_large`, `unsupported`, `expired`).
   - Server: `server/services/uploads.ts` — `createWallpaperUpload` (creator, rate limit 20/h, feature `uploadsEnabled`, content type allow-list, bytes ≤ 15 MB, inserts `uploads` row, presigned PUT for `incomingUploadKey`); `finalizeWallpaperUpload` (owner, status pending; `head` size check; `getBytes`; `sharp().rotate()`; metadata checks; write `full.jpg` (≤ 2868 px tall, q90, metadata stripped) + `preview.webp`; delete incoming; palette via `server/render/palette-extract.ts` (k-means k = 6 in OKLab on a 64×64 thumb, seeded, sorted by population); update row `ready`; return `assetKey`, `previewUrl`, dims, palette).
   - `server/render/palette-extract.ts` + `lib/render/photo-palette.ts` (pure: roles from extracted colours per `docs/05` §12 step 3).

4. **Theme authoring** — `creator/themes/new/page.tsx` and `creator/themes/[id]/page.tsx`:
   - Reuse `StudioShell` in **creator mode**: adds the photo option in `WallpaperPanel` (uploader → `kind: 'image'` with focal point picker (tap on preview) and dim slider), three icon-style suggestions from the photo palette, and a **Details** panel: name EN (required) / AR, descriptions, aesthetic (required single select), up to 5 more tags.
   - Save draft (`createCreatorTheme` / `updateCreatorTheme`), **Submit for review** (`submitTheme` → `pending_review` via `transitionThemeStatus`), Withdraw, Delete. Editing a rejected theme moves it to draft automatically (state machine).
   - Ownership + status checks in services; only `draft`/`rejected` editable.

5. **Profile** — `creator/profile/page.tsx`: display name, bio, links, avatar (use separate avatar reservation/finalization with minimum 256×256 input and a centered 256×256 WebP avatar variant; `avatars/{userId}/{hash}.webp`); `themes` and `creator(handle)` cache tags are updated on save. Upload boundaries and serialization follow docs/05 §12.1.

6. **Messages**: `creator.*` (EN + AR).

7. **Tests**: handle validation + reserved handles (`admin`, `vibeset`, `support`…), upload validation (dims/aspect/type/size), palette role derivation, creator theme ownership + editable statuses, submit requires aesthetic tag.

## Acceptance checks

- [ ] Apply → (approve via DB or wait for P14) → creator area unlocks; non-creators get 404 on `/creator`.
- [ ] iPhone photo (HEIC) uploads, shows progress, extracts a sensible palette; GPS metadata absent from `full.jpg`.
- [ ] Theme with photo wallpaper saves, submits, appears in the admin queue (DB until P13).
- [ ] Oversize/too-small/wrong-aspect files fail with clear translated messages.
- [ ] Regression: Studio for normal users unchanged.
- [ ] tests, typecheck, lint, build pass.

## Finish

Commit: `P12: creator tools`.
