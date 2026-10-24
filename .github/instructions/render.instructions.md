---
description: 'Renderer rules — isomorphic SVG renderer, server rasterizer, client rasterizer'
applyTo: 'lib/render/**,server/render/**,lib/client/**'
---

# Renderer

Read `docs/01-architecture.md` §4 and `docs/05-content-pipeline.md` §3–§8 before changing anything here.

## `lib/render/**` — isomorphic, pure, deterministic

- No `window`, `document`, `fetch`, `fs`, `path`, `Buffer`, React, `next/*`, `@/server/*`, `@/db/*`, `Math.random`, `Date`, `crypto.randomUUID`. (`globalThis.crypto.subtle` is allowed in `hash.ts` only.) ESLint enforces this with `no-restricted-imports`/`no-restricted-globals` overrides.
- Randomness: `createRng(seed)` (mulberry32) from `prng.ts`, passed explicitly. Same spec ⇒ byte-identical SVG (snapshot tests in `tests/unit/render`).
- Inputs are already-validated `ThemeSpec`/`IconStyle`; still clamp numbers defensively. Never interpolate free text into SVG. Colours are lowercase `#rrggbb`. Glyph names match `^[a-z0-9-]{1,48}$`.
- Glyphs come from a `GlyphSource` (`get(name, weight) → string | undefined`) passed by the caller; missing glyph → render a neutral fallback circle and report it via the returned `warnings` array.
- Output helpers: `svgDocument({ w, h, defs, body })`, numbers rounded to 2 decimals, ids namespaced with a prefix to avoid collisions when composing (preview embeds wallpaper + icons).
- Allowed SVG: paths, shapes, linear/radial gradients, `<pattern>`, `clipPath`, `mask`, opacity, transforms, `feGaussianBlur`, `feDropShadow`. Forbidden: `<text>` outside `preview.ts`, `<foreignObject>`, `<script>`, external `href`, `feTurbulence`, CSS `<style>`.
- Grain is not drawn in SVG: return `grain` in `RenderResult`; rasterizers apply the seeded noise tile (`noise.ts` produces RGBA bytes deterministically).
- Photo wallpapers: SVG contains only overlays; return `background` for the rasterizer.
- Keep each generator under ~250 lines; shared geometry in `geometry.ts` (Catmull-Rom → Bézier, Poisson disk, superellipse).

## `server/render/**` — Node rasterizer

- `rasterize(result, { w, h, format: 'png' | 'jpeg' | 'webp', quality })`: `renderAsync` from `@resvg/resvg-js` with `fitTo: { mode: 'width', value: w }`, fonts from `assets/fonts/*.ttf` (`loadSystemFonts: false`, `defaultFontFamily: 'Readex Pro'`) → sharp: draw photo background first when present (cover at focal point), composite SVG PNG, composite noise tile (`tile: true`, `blend: 'soft-light'`), encode (JPEG `mozjpeg`, `chromaSubsampling: '4:4:4'`).
- `server/render/glyphs.ts`: reads `public/glyphs/v1/{weight}.json` once per process (memoised). Files are traced via `outputFileTracingIncludes`.
- `hash.ts`: dHash (sharp greyscale → 9 × 8 raw → 64-bit hex) and Hamming distance.
- Never block the event loop with synchronous resvg on large outputs.

## `lib/client/**` — browser only

- `rasterize.ts`: SVG string → `Blob('image/svg+xml')` → `HTMLImageElement.decode()` → `<canvas>` → draw photo background (`createImageBitmap` from a CORS fetch) → draw SVG → noise pattern (`globalCompositeOperation = 'soft-light'`) → `canvas.toBlob`. Max 16.7M pixels per canvas; after use set `canvas.width = canvas.height = 0` and revoke object URLs.
- Chunk long jobs (6 items per chunk) and yield between chunks; support `AbortSignal`.
- `share.ts`, `zip.ts`, `platform.ts`, `track.ts` follow `docs/06-install-flows.md` exactly (two-step share, batch size constant, in-app-browser detection, keepalive tracking requests with credentials omitted).
