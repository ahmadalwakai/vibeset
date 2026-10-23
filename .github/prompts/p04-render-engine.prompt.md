---
description: 'P04 · Render engine — glyph data, fonts, isomorphic SVG renderer, server + client rasterizers, dev playground'
agent: 'agent'
---

# P04 · Render engine

Read first: [architecture §4](../../docs/01-architecture.md) · [content pipeline §3–§6](../../docs/05-content-pipeline.md) · [data model §5](../../docs/02-data-model.md) · [renderer rules](../instructions/render.instructions.md)

## Goal

One deterministic renderer that turns a `ThemeSpec` into wallpapers, icons, widgets and previews — identical on server (resvg + sharp) and in the browser (canvas). This is the product's core; quality matters more than speed here.

## Tasks

1. **Content needed by the renderer**
   - `content/apps.ts` — the 125-app table from `docs/05` §13 as a typed `as const satisfies readonly CatalogApp[]` array (`slug`, `name`, `aliases: string[]` (add 1–3 common aliases incl. Arabic names where they exist, e.g. واتساب, انستقرام, سناب), `category`, `glyph`, `rank`).
   - `content/fonts.ts` — `FONT_IDS` metadata: CSS variable, display name, TTF file name, scripts supported.

2. **Glyph data** — `scripts/generate-glyphs.ts` (npm `glyphs:build`, plain `tsx`):
   - Read `@phosphor-icons/core` metadata (`icons` export: name, categories, tags) and the SVG assets. Detect the asset path pattern per weight by inspecting the package (`assets/{weight}/…`); don't guess — log the pattern found.
   - Sanitise each SVG: keep only inner elements `g, path, circle, rect, ellipse, line, polyline, polygon` and attributes `d, cx, cy, r, rx, ry, x, y, width, height, x1, y1, x2, y2, points, opacity, fill-rule, clip-rule, transform, stroke-width, stroke-linecap, stroke-linejoin`; convert any colour values to `currentColor`.
   - Write `public/glyphs/v1/{thin,light,regular,bold,fill,duotone}.json` (`{ [name]: innerMarkup }`) and `public/glyphs/v1/manifest.json` (`[{ name, categories, tags }]`); copy the licence to `public/glyphs/LICENSE.txt`.
   - Validate every glyph referenced in `content/apps.ts` and, if present, `content/aesthetics.ts` (decor) — exit 1 listing missing names. Fix `content/apps.ts` with the closest existing glyph and report changes.

3. **Fonts** — `scripts/fetch-fonts.ts` (npm `fonts:fetch`): for each folder `ofl/readexpro`, `ofl/fraunces`, `ofl/elmessiri`, `ofl/pacifico`, `ofl/spacegrotesk`, `ofl/jetbrainsmono` call `https://api.github.com/repos/google/fonts/contents/<folder>`, download the `.ttf` file(s) and `OFL.txt` into `assets/fonts/<Family>/`. Idempotent (skip existing). If the network call fails in your environment, stop and tell me which files to add manually.

4. **Isomorphic renderer** — `lib/render/` (pure; see renderer rules):
   - `prng.ts` — mulberry32 `createRng(seed)` with `next()`, `range(a,b)`, `int(a,b)`, `pick(arr)`, `weighted(items)`, `chance(p)`, `shuffle(arr)`.
   - `color.ts` — with `culori`: `toOklch`, `mixOklab(a, b, t)`, `contrast(a, b)` (WCAG), `ensureContrast(fg, bg, min)` (adjust OKLCH lightness), `deltaE(a, b)` (OKLab), `colorFamilyOf(hex)` (buckets in `docs/05` §9), `withAlpha(hex, a)`.
   - `geometry.ts` — Catmull-Rom → cubic Bézier path, Poisson-disk sampler (seeded, bounded attempts), superellipse path (n = 5, 64 points), rounded-rect path.
   - `svg.ts` — `svgDocument({ w, h, defs, body })`, `fmt(n)` (2 decimals), `idFactory(prefix)`, `svgDataUrl(svg)` (`data:image/svg+xml;charset=utf-8,` + `encodeURIComponent`).
   - `glyphs.ts` — `interface GlyphSource { get(name: string, weight: GlyphWeight): string | undefined }`, `placeGlyph({ markup, x, y, size, color, rotate? })` (Phosphor viewBox 0 0 256 256 → `<g color fill="currentColor" transform>`).
   - `noise.ts` — `noiseTile(seed, grain, size = 128)` → `Uint8ClampedArray` RGBA (alpha = round(grain × 255 × value)).
   - `palette.ts` — `deriveWallpaperColors(spec.palette, kind)`, `inkMuted(palette)`.
   - `wallpaper/{index,mesh,blobs,waves,pattern,scatter,aurora,sky,shapes,image}.ts` + `shapes/bow.ts` — algorithms from `docs/05` §3. `index.ts` exports `renderWallpaper(spec, which: 'home' | 'lock', { w, h }, glyphs): RenderResult` with `warnings`.
   - `icon.ts` — `renderIcon(style, glyphMarkup, { size, platform: 'ios' | 'shaped', palette, glyphs, wallpaper?: RenderResult, prefix? })` per `docs/05` §4 (iOS opaque full-bleed; shaped clip + transparent).
   - `widgets.ts` — `renderWidget(kind: 'glyphBadge' | 'ring' | 'stickerCollage' | 'photoFrame', spec, { w, h }, glyphs)` (no text).
   - `preview.ts` — `renderHomePreview(spec, glyphs, apps, { w, h, prefix? })`, `renderLockPreview(spec, glyphs, { w, h, prefix? })`; embed fixed clock outlines generated from the chosen display font, following architecture §4.4, so SVG image decoding does not rely on external fonts.
   - `devices.ts` — presets `phone` 1320×2868, `tablet` 2048×2732, `desktop` 2560×1440, `desktop4k` 3840×2160, `thumb` 360×780, `preview` 720×1560, `og` 1200×630.
   - `index.ts` — public API re-exports.

5. **Server rasterizer** — `server/render/` (`import 'server-only'`):
   - `fonts.ts` (absolute paths of TTFs under `assets/fonts`), `glyphs.ts` (memoised fs `GlyphSource` from `public/glyphs/v1`), `rasterize.ts` (`rasterize(result, { w, h, format, quality, focalBackground? })` per renderer rules: `renderAsync` → sharp composite photo/SVG/noise → encode), `hash.ts` (`dHash(buffer)`, `hamming(a, b)`), `og.ts` (compose OG 1200×630 from two preview PNGs on a palette-tinted background with the wordmark).

6. **Client rasterizer** — `lib/client/glyphs.ts` (fetch weight JSON once, memoised promise per weight, AbortSignal aware) and `lib/client/rasterize.ts` (`rasterizeInBrowser(result, { w, h, type: 'image/png' | 'image/jpeg', quality, signal })` per renderer rules, 16.7M-pixel guard, canvas released after use).

7. **Dev playground** — `app/[locale]/(site)/dev/render/page.tsx` (calls `notFound()` when `process.env.NODE_ENV === 'production'`) + client component: palette select, wallpaper kind select, seed input/shuffle, grain slider; grid of all wallpaper kinds, all icon fills (iOS + shaped), the four widgets, home/lock previews (client rendering). Purpose: visual tuning of generators.

8. **Sample script** — `scripts/render-sample.ts`: renders a fixed spec on the server to `.tmp/` (phone wallpaper JPEG, preview PNGs, OG, 6 icons) so you can compare with the browser playground.

9. **Tests** (`tests/unit/render/`): PRNG sequence fixed for a seed; colour utils (known contrast pairs, family buckets); each wallpaper kind SVG snapshot for a fixed spec (`toMatchSnapshot`); identical output for identical input across two calls; icon renders for every fill × platform include no external `href`, no `<script>`, no `<text>`; Poisson sampler respects min distance; noise tile deterministic.

## Acceptance checks

- [ ] `npm run glyphs:build` and `npm run fonts:fetch` succeed; manifest lists 1,432 generic glyphs with Phosphor 2.1.1 (brands excluded); all app glyphs valid.
- [ ] `/dev/render` shows every kind and fill; changing seed changes output; same seed is stable after reload.
- [ ] `.tmp/` outputs from `scripts/render-sample.ts` match the browser playground visually (colours, layout, grain).
- [ ] Phone wallpaper JPEG ≤ 3 MB; server render of a phone wallpaper < 3 s locally.
- [ ] tests, typecheck, lint, build pass.

## Finish

Report generator visual issues you noticed and how you tuned them. Commit: `P04: render engine`.
