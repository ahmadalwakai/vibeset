---
description: 'P10 · Studio — live remix editor with undo/redo, autosave, share links, save remixes, downloads'
agent: 'agent'
---

# P10 · Studio (Remix)

Read first: [product §6](../../docs/00-product.md) · [design system §6–§7](../../docs/04-design-system.md) · [data model §5](../../docs/02-data-model.md) · [API §4 (studio)](../../docs/03-api-and-permissions.md) · [UI rules](../instructions/ui.instructions.md)

## Goal

The feature ThemePack doesn't have: open any theme, change colours, wallpaper, icon style and fonts live, then download, share a link, or save it.

## Tasks

1. **Editor state** — `hooks/useThemeEditor.ts` + pure reducer `hooks/theme-editor-state.ts`:
   - Actions: `setPaletteRole`, `applyPalettePreset`, `setWallpaper` (kind switch builds sensible defaults from `content/aesthetics` ranges), `patchWallpaper`, `shuffleSeed`, `setLockMode` (`same` | `variant`), `patchIcons`, `patchWidgets`, `setFont`, `setDecor`, `undo`, `redo`, `reset`, `load(spec)`.
   - Every next state validated with `themeSpecSchema.safeParse`; invalid → state unchanged + returned error.
   - History ≤ 50; consecutive changes of the same control within 400 ms coalesce into one entry (slider drags).
   - Autosave to `localStorage` (`vibeset:studio-draft`, debounced 500 ms, includes `sourceSlug`).
   - Keyboard: ⌘/Ctrl+Z undo, ⇧⌘/Ctrl+Shift+Z redo (ignored while typing in inputs).

2. **Entry** — `app/[locale]/(site)/studio/page.tsx`: static shell (toolbar + panel skeleton) + `<Suspense>` boundary that awaits `searchParams`:
   - `?s=` → `lz-string` decompress → JSON → `themeSpecSchema` (invalid → toast + fallback);
   - `?from=slug` → `getThemeDetail(slug)` spec;
   - else saved draft; else a random spec from `buildSpec` with a random recipe/palette (dynamic import of `content/*`).
   - `generateMetadata`: `robots: { index: false }` when `s` is present; otherwise indexable landing copy.

3. **Layout** per `docs/04` §7 — `components/studio/StudioShell.tsx`, `StudioToolbar.tsx` (undo, redo, shuffle (icon rotates), share, save, download, get icons), `StudioPreview.tsx`, panels `ColorsPanel`, `WallpaperPanel`, `IconsPanel`, `WidgetsPanel`, `TypePanel`. Mobile: preview on top, tabbed bottom sheet; lg+: side panel 360 px.

4. **Preview** — `StudioPreview` with Home/Lock tabs inside `PhoneFrame` (`dir="ltr"`):
   - Wallpaper: `useDeferredValue(spec)` → `renderWallpaper` at preview size → `<img src={svgDataUrl}>`; grain as CSS overlay of the seeded noise tile (canvas → data URL, memoised per seed+grain); crossfade 160 ms between renders.
   - Icons: 4×4 grid of the top 16 apps rendered with `renderIcon` (memoised by `icons` + `palette` hash; re-render only when they change); dock with 4 icons.
   - Widgets and lock clock rendered as DOM (real fonts via CSS variables).
   - Heavy kinds (scatter with many glyphs) debounce 120 ms. Target < 50 ms per update on a mid-range phone.

5. **Panels**
   - Colours: palette presets as swatch rows (from `content/palettes.ts`), per-role Chakra `ColorPicker`, contrast badge on the icon glyph/background pair (warn < 3:1).
   - Wallpaper: kind `SegmentGroup`; parameter sliders per kind (ranges from the schema); pattern picker; scatter glyph picker (`GlyphPicker`, ≤ 6); seed shuffle; lock mode; for creators only, "Use my photo" (wired in P12).
   - Icons: fill, shape (note: iOS ignores shape), glyph weight, glyph size, border, sticker (glyph + corner), shadow — with a live row of 5 icons.
   - Widgets: style, radius, colours. Type: display font (rendered samples), body font.

6. **Actions**
   - **Share**: compress spec to `/studio?s=…`; if the URL > 6,000 chars or the wallpaper is a photo → toast "Save to share this one" instead. Copy link + Web Share when available.
   - **Download** / **Get icons**: reuse `WallpaperDownloadSheet` (spec mode — all sizes rendered on device) and `IconExportSheet` with the editor's spec.
   - **Save** (signed in): `saveRemix` / `updateRemix`; visitors get a sign-in prompt and their draft is kept. Photo wallpapers can't be saved by non-creators (`FORBIDDEN` → explain).
   - `track('remix')` once when opened with `?from` and the user downloads or saves.

7. **Server** — `lib/validation/remixes.ts`, `server/services/remixes.ts` (`saveRemix`, `updateRemix`, `deleteRemix`: owner checks, status `draft`, source `remix`, `remix_of_id` from published slug, name uniqueness not required, slug `remix-{random}`), `server/actions/studio.ts` (`createAction`, auth `user`, save/update share a rate limit of 30/h). Studio saves private drafts; an approved creator may later submit one through the separate review/publish workflow. Both home and lock photo wallpapers require an approved creator/admin and their own ready uploads.

8. **Messages**: `studio.*` (EN + AR).

9. **Tests**: reducer (each action, validation rejection, coalescing, undo/redo bounds), share link round-trip + oversize detection, `saveRemix` rejects photo wallpapers for non-creators (unit with mocked guards).

## Acceptance checks

- [ ] `/studio?from=<slug>` loads the theme; every control updates the preview smoothly on a phone.
- [ ] Undo/redo works across all panels; reload restores the draft.
- [ ] Share link opens the identical design in a private window.
- [ ] Download (phone + My screen) and Get icons use the edited design.
- [ ] Signed-in save appears under Saved → Remixes (P11) — verify the row in the DB for now.
- [ ] tests, typecheck, lint, build pass.

## Finish

Commit: `P10: studio`.
