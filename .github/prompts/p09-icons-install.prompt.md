---
description: 'P09 · Icons & install — icon export (any app), iOS Shortcuts wizard, Android/desktop guides, custom-size wallpapers, decor widgets'
agent: 'agent'
---

# P09 · Icon export & install guides

Read first: [install flows — all](../../docs/06-install-flows.md) · [content pipeline §4–§5, §13](../../docs/05-content-pipeline.md) · [renderer rules](../instructions/render.instructions.md) · [UI rules](../instructions/ui.instructions.md)

## Goal

From any theme, a user picks their apps (or any custom app), gets a matching icon pack generated on their device in seconds, saves it, and is guided step by step until their home screen is done.

## Tasks

1. **Icon export engine** — `lib/client/icon-export.ts`:
   `exportIcons({ spec, apps, custom, platform: 'ios' | 'shaped', signal, onProgress }) → Promise<File[]>`
   - Loads the glyph weight JSON for `spec.icons.glyphWeight` (+ sticker weight) via `lib/client/glyphs.ts`.
   - For `fill: 'wallpaper'`: renders the wallpaper once (photo wallpapers → fall back to `gradient` with palette colours and report it in the UI).
   - Renders each icon with `renderIcon` → `rasterizeInBrowser` 512×512 PNG; chunks of 6 with a yield between chunks; checks `signal.aborted` between items; names `vibeset-{slug}-{appSlug}.png`.
   - Pure helpers in `lib/client/icon-export-utils.ts`: `defaultSelection(apps)`, `chunk(files, n)`, `fileNameFor(slug, appSlug)`, `matchesSearch(app, query)` (case/diacritic-insensitive, aliases incl. Arabic).

2. **App catalogue on the client** — `hooks/useAppCatalog.ts`: fetch `/api/v1/apps` once (module-level promise cache), abort-safe.

3. **Icon export sheet** — `components/theme/IconExportSheet.tsx` (client, `next/dynamic` on first open), three steps with Chakra `Steps`:
   1. **Pick apps** — search, category chips, select all/none, default = rank ≤ 24, selection persisted (`vibeset:selected-apps`), live mini-preview of each icon in the theme style (render lazily as items scroll into view). **+ Custom icon**: label (1–24 chars) + `GlyphPicker` (search over `manifest.json` names/tags, max 120 results rendered, keyboard accessible).
   2. **Generate** — progress "12 / 24" with `aria-live`, cancel (AbortController), finished icons pop into a grid.
   3. **Save** — iOS: batch buttons "Save 1–20", "Save 21–24" (each a direct `shareFiles` call), then "Set them up" → `/setup/ios?theme={slug}`. Android/desktop: "Download ZIP" (`lib/client/zip.ts` with `fflate` async `zip`, level 0) + "Share images" when supported, then link to `/setup/android`.
   - `track('icon_export')` once after the first successful save/ZIP.
   - Wire the **Get icons** button into `ThemeActionBar` through its `iconsAction` prop (P08).

4. **Custom-size wallpapers** — extend `WallpaperDownloadSheet`: for generated wallpapers (not `image` kind) add "4K desktop" (3840×2160) and "My screen" (`round(screen.width × devicePixelRatio)` × `round(screen.height × devicePixelRatio)`, clamp to 16.7M px). Render on device (dynamic import of `lib/render` + rasterizer), JPEG q0.92, then the same save flow.

5. **Decor widgets (optional section)** in `IconExportSheet`: toggle "Widget decor" → renders `glyphBadge`, `ring`, `stickerCollage`, `photoFrame` at their sizes (`docs/01` §4.5) → saved with the icons. Copy explains they're static (Photos widget) and live widgets come with the app.

6. **iOS wizard** — `app/[locale]/(site)/setup/ios/page.tsx`: static intro (cached) + client `IosSetupWizard` in Suspense (reads `?theme`, loads `ThemeDetailDTO` via `/api/v1/themes/[slug]`, selected apps from `localStorage`).
   - Intro `Steps` (Save icons → Create shortcuts → Hide originals → Set wallpaper).
   - Per-app checklist cards: app icon (re-rendered small from spec, or plain glyph without a theme), the 6 steps from `docs/06` §3.3, "Open Shortcuts" button (`shortcuts://create-shortcut`), "Done ✓". Progress bar; state in `vibeset:ios-wizard:{slug}`; resume where you left off.
   - Step media: `components/setup/StepMedia.tsx` plays `muted playsInline loop` MP4 from `${CDN}/setup/ios/{step}.mp4` when present (constant list in `content/setup-media.ts`), otherwise a numbered illustration built from Phosphor glyphs. (Recording the clips is a content task in P17.)
   - Finish screen + FAQ; `track('setup_complete')` once.

7. **Android & desktop guides** — `setup/android/page.tsx`, `setup/desktop/page.tsx`: static, cached, translated, using the shared `StepCard`.

8. **Messages**: `setup.*`, `theme.icons.*` (EN + AR, native Arabic).

9. **Tests**: icon-export utils; deterministic icon file naming; `matchesSearch` with Arabic aliases; wizard progress reducer (pure).

## Acceptance checks

- [ ] Real iPhone: 24 icons generate in < 6 s, save in two batches, wizard walks through one app end-to-end and the custom icon appears on the home screen.
- [ ] Android: ZIP downloads and opens; shaped icons have transparent corners.
- [ ] Custom icon for an app not in the catalogue works.
- [ ] Cancel during generation stops work immediately; no memory growth after repeated exports (check DevTools memory).
- [ ] "My screen" wallpaper matches the device resolution.
- [ ] tests, typecheck, lint, build pass.

## Finish

Commit: `P09: icon export & install guides`.
