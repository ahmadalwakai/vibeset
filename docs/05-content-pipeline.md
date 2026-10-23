# Vibeset — Content Pipeline (how we ship hundreds of themes)

Goal: **~400 high-quality themes at launch**, +20–30 per week after, at near-zero cost, without scraping or licensing risk.

```
content/palettes.ts ─┐
content/aesthetics.ts ┼─▶ generator (spec builder + QA + duplicate hash) ─▶ draft themes
content/apps.ts ─────┘                                                       │
                                     admin review deck (A/R/S/F) ◀───────────┘
                                                  │ approved
                                                  ▼
                        publish service: render (resvg) → encode (sharp) → R2 → published
creators: upload photo → palette extraction → Studio → submit → review ─────────┘
```

Every generated theme is reviewed by a human before it goes public. The generator proposes; the admin curates.

---

## 1. Palettes (`content/palettes.ts`)

Format: roles are curated by hand; `inkMuted` is derived (`mix(ink, bg, 0.38)` in OKLab).

```ts
export interface CuratedPalette {
  id: string; nameEn: string; nameAr: string; mode: 'light' | 'dark';
  bg: string; surface: string; primary: string; accent: string; ink: string;
}
```

| id | EN | AR | mode | bg | surface | primary | accent | ink |
|---|---|---|---|---|---|---|---|---|
| cotton-candy | Cotton Candy | غزل البنات | light | #fdebf3 | #ffffff | #f7a8c8 | #a8d8f7 | #4a2c3e |
| peach-fuzz | Peach Fuzz | خوخي ناعم | light | #ffede3 | #fff8f3 | #ffb38a | #f7d488 | #5a3324 |
| lavender-haze | Lavender Haze | ضباب اللافندر | light | #eee7fa | #fbf8ff | #b9a3e8 | #f5b8d9 | #3b2d5c |
| matcha-latte | Matcha Latte | ماتشا لاتيه | light | #eef2e1 | #fafbf4 | #a8bf7a | #e9d8a6 | #2f3a1e |
| butter-cream | Butter Cream | كريمة الزبدة | light | #fff7db | #fffdf4 | #f6d86b | #f3a9a0 | #4d3b12 |
| baby-blue | Baby Blue | أزرق سماوي | light | #e6f2fc | #f7fbff | #8ec5ee | #f6c1d6 | #1e3a55 |
| mint-sorbet | Mint Sorbet | سوربيه النعناع | light | #e3f7ef | #f6fdf9 | #8ddbb9 | #ffcba4 | #1c4034 |
| strawberry-milk | Strawberry Milk | حليب الفراولة | light | #ffe4ea | #fff6f8 | #f48fa6 | #c7e9b0 | #5b1f31 |
| cloud-nine | Cloud Nine | فوق الغيم | light | #f1f4f9 | #ffffff | #b8c7de | #f2d7e8 | #2a3446 |
| lemon-sorbet | Lemon Sorbet | سوربيه الليمون | light | #fbf9d9 | #fffef2 | #ede36b | #9fd8c2 | #3e3a0f |
| sakura | Sakura | ساكورا | light | #fceef1 | #fffafb | #f2b5c4 | #b9d7a8 | #4a2730 |
| vanilla-sky | Vanilla Sky | سماء الفانيلا | light | #fff4e6 | #fffbf5 | #f5c29a | #a9c6e8 | #4b3a2b |
| coquette | Coquette | كوكيت | light | #fff0f3 | #ffffff | #f2a7b5 | #e0577a | #3d1a22 |
| clean-girl | Clean Girl | بساطة ناعمة | light | #f5f0ea | #fffdfa | #d9c7b3 | #a68a6d | #2e2620 |
| sage-garden | Sage Garden | حديقة المريمية | light | #e9eee4 | #f8faf5 | #9caf88 | #e3b5a4 | #26301f |
| seafoam | Seafoam | زبد البحر | light | #e2f4f2 | #f6fcfb | #7fcfc6 | #f7b7a3 | #16403b |
| apricot-sunset | Apricot Sunset | غروب المشمش | light | #ffe8d6 | #fff6ee | #ffa69e | #ffd166 | #5a2a1e |
| lilac-dream | Lilac Dream | حلم الليلك | light | #f3e8ff | #fdf9ff | #cdb4ff | #a0e7e5 | #3a2759 |
| honey-oat | Honey Oat | عسل وشوفان | light | #f7ebd8 | #fff9f0 | #e6b970 | #b5835a | #3f2e19 |
| bubblegum | Bubblegum | علكة | light | #ffe3f4 | #fff5fb | #ff8fcf | #7fd3ff | #4a1238 |
| pistachio | Pistachio | فستق | light | #edf5e1 | #fafdf5 | #b5d99c | #f2c6de | #2d3d1c |
| ocean-breeze | Ocean Breeze | نسيم المحيط | light | #e4f1fb | #f5fafe | #6fb1e0 | #ffe08a | #12324d |
| rose-gold | Rose Gold | ذهبي وردي | light | #f8e8e3 | #fff7f4 | #e3a99b | #c9a27e | #4a2b26 |
| ramadan-cream | Ramadan Cream | رمضان كريمي | light | #fbf3e4 | #fffaf1 | #c9a24d | #2f6b5e | #2b2416 |
| retro-groovy | Retro Groovy | ريترو | light | #fff1d6 | #fff9ec | #f28c28 | #2a9d8f | #3b2412 |
| citrus-pop | Citrus Pop | حمضيات | light | #fff8e1 | #fffdf5 | #ff9f1c | #2ec4b6 | #2b2b2b |
| bauhaus | Bauhaus | باوهاوس | light | #f4efe6 | #ffffff | #e63946 | #1d3557 | #111111 |
| checker-indie | Checker Indie | إندي مربعات | light | #f7f3ec | #ffffff | #2f2f2f | #e3b23c | #1a1a1a |
| leopard-luxe | Leopard Luxe | فهدي فاخر | light | #f6e7d7 | #fff6ec | #c68b59 | #3b2a20 | #2a1d15 |
| midnight-y2k | Midnight Y2K | منتصف الليل Y2K | dark | #14101f | #241b38 | #b794f4 | #f687b3 | #f4eeff |
| noir | Noir | نوار | dark | #0e0e10 | #1c1c21 | #e5e5ea | #8e8e99 | #fafafa |
| cyber-neon | Cyber Neon | نيون سايبر | dark | #0b0f1a | #141b2d | #00f5d4 | #f15bb5 | #e8fffb |
| dark-academia | Dark Academia | الأكاديمية المظلمة | dark | #1e1914 | #2e261e | #a67c52 | #7a8b6f | #efe6d8 |
| galaxy | Galaxy | مجرّة | dark | #0d0b26 | #1b1747 | #7b6cf6 | #f9a8d4 | #eeebff |
| forest-night | Forest Night | غابة ليلية | dark | #0f1a14 | #1a2b21 | #5fa77a | #e8c468 | #e9f5ec |
| vaporwave | Vaporwave | فيبرويف | dark | #1a0f2e | #2b1a4a | #ff71ce | #01cdfe | #fff5fd |
| espresso | Espresso | إسبريسو | dark | #1c1410 | #2c211b | #c08b5c | #e8d3b9 | #f6eee6 |
| deep-ocean | Deep Ocean | أعماق المحيط | dark | #071a2b | #0f2c45 | #3fa7d6 | #f6ae2d | #e6f4ff |
| grunge | Grunge | غرنج | dark | #161616 | #262626 | #8c8c8c | #c1440e | #ededed |
| emo-pink | Emo Pink | إيمو وردي | dark | #120a10 | #22131d | #ff4fa3 | #b5b5b5 | #ffe6f2 |
| ramadan-night | Ramadan Nights | ليالي رمضان | dark | #0e1a2b | #182a40 | #e2b35b | #3e8e7e | #fbf4e4 |
| wine | Wine | نبيذي | dark | #1f0a12 | #33121f | #b23a5a | #e8b4bc | #fceaee |
| aurora | Aurora | شفق | dark | #06141b | #0e2430 | #4be3ac | #9d7bff | #e8fff7 |
| halloween | Halloween | هالوين | dark | #160f14 | #261a22 | #ff7a1a | #8e5cf7 | #fff1e6 |
| holiday-cozy | Holiday Cozy | دفء الأعياد | dark | #1a2a22 | #24392e | #d64545 | #f2d492 | #fbf6ec |

---

## 2. Aesthetics (`content/aesthetics.ts`)

```ts
export interface AestheticRecipe {
  slug: string; nameEn: string; nameAr: string; shortEn: string;   // shortEn is used in generated names
  descriptionEn: string; descriptionAr: string;
  palettes: string[];                                              // palette ids
  wallpapers: { kind: WallpaperKind; weight: number; params?: Record<string, [number, number] | unknown> }[];
  lockWallpaper: 'same' | 'variant';
  icons: { fills: IconFill[]; weights: GlyphWeight[]; scale: [number, number];
           borderChance: number; stickerChance: number; shadowChance: number };
  widgets: { styles: ('glass' | 'solid' | 'outline' | 'paper')[]; radius: [number, number] };
  fonts: { display: FontId[]; body: FontId[] };
  decor: string[];                                                 // Phosphor glyph names (validated)
  moods: string[]; styles: string[]; season?: string;
  variants: number;                                                // published target, default 10
}
```

| slug | EN / AR | palettes | wallpaper kinds (weight) | icon fills · weights | decor glyphs | fonts (display) | moods · season |
|---|---|---|---|---|---|---|---|
| y2k | Y2K / واي تو كي | midnight-y2k, bubblegum, lilac-dream, cotton-candy, emo-pink | pattern:y2k-grid 3, scatter 3, mesh 2 | glass, gradient, outline · bold, fill | butterfly, sparkle, star, heart | space-grotesk, pacifico | playful, bold |
| coquette | Coquette / كوكيت | coquette, strawberry-milk, rose-gold, sakura | pattern:bows 3, pattern:gingham 2, scatter 2 | solid, outline · regular, light, duotone | heart, flower, sparkle | fraunces, pacifico | romantic, cute |
| kawaii | Kawaii / كاواي | bubblegum, cotton-candy, mint-sorbet, lemon-sorbet, baby-blue | pattern:dots 3, scatter 3, sky 1 | solid, gradient · fill, bold, duotone (stickers 40%) | star, heart, cloud, smiley | pacifico | cute, playful |
| clean-minimal | Clean Minimal / بسيط ونظيف | clean-girl, cloud-nine, vanilla-sky, noir | mesh 3, aurora 1, waves 1 | solid, outline · thin, light | sparkle | fraunces | minimal, calm |
| dark-academia | Dark Academia / الأكاديمية المظلمة | dark-academia, espresso, wine | mesh 2, pattern:stripes 1, scatter 2 | solid, outline · light, regular | book-open, feather, hourglass, moon | fraunces | mysterious, elegant · autumn |
| cottagecore | Cottagecore / حياة الريف | sage-garden, matcha-latte, honey-oat, pistachio | pattern:gingham 3, scatter 3, waves 1 | solid, wallpaper · regular, duotone | flower, leaf, plant | fraunces | cozy, calm · spring |
| cyberpunk | Cyberpunk / سايبربانك | cyber-neon, vaporwave, galaxy | pattern:y2k-grid 2, aurora 2, mesh 1 | outline, glass · bold, regular | lightning, cpu, circuitry | jetbrains-mono, space-grotesk | bold, edgy |
| vaporwave | Vaporwave / فيبرويف | vaporwave, lilac-dream, midnight-y2k | sky (sunset) 2, pattern:y2k-grid 2, waves 1 | gradient, glass · bold | sun-horizon, star, sparkle | space-grotesk | retro, dreamy |
| pastel-dream | Pastel Dream / حلم الباستيل | cotton-candy, lavender-haze, baby-blue, mint-sorbet, peach-fuzz | mesh 3, blobs 3, sky (day) 1 | gradient, solid, glass · regular, fill | sparkle, cloud, heart | fraunces, pacifico | dreamy, cute |
| matcha-cafe | Matcha Café / مقهى الماتشا | matcha-latte, pistachio, honey-oat | blobs 2, waves 2, pattern:dots 1 | solid · regular, duotone | coffee, leaf | fraunces | cozy, fresh |
| latte-mocha | Latte & Mocha / لاتيه وموكا | espresso, honey-oat, vanilla-sky, clean-girl | mesh 2, waves 2 | solid, outline · light, regular | coffee, cookie | fraunces | cozy, elegant · autumn |
| sakura-spring | Sakura Spring / ربيع الساكورا | sakura, cotton-candy, pistachio | scatter 3, blobs 2 | solid, gradient · regular, duotone | flower, flower-lotus, butterfly | fraunces | romantic, fresh · spring |
| ocean-breeze | Ocean Breeze / نسيم المحيط | ocean-breeze, seafoam, deep-ocean, baby-blue | waves 3, aurora 1, blobs 1 | solid, glass · regular, bold | waves, fish, anchor | readex-pro | calm, fresh · summer |
| sunset-glow | Sunset Glow / وهج الغروب | apricot-sunset, peach-fuzz, vaporwave | sky (sunset) 3, mesh 2, waves 1 | gradient · bold, regular | sun, sun-horizon | fraunces | dreamy, calm · summer |
| starry-night | Starry Night / ليلة النجوم | galaxy, midnight-y2k, deep-ocean, ramadan-night | sky (night) 3, scatter 2 | glass, outline · light, regular | star, sparkle, moon | fraunces | dreamy, mysterious |
| galaxy-dream | Galaxy Dream / حلم المجرّة | galaxy, vaporwave, aurora | aurora 2, mesh 2, sky (night) 1 | glass, gradient · regular, bold | planet, rocket, star | space-grotesk | dreamy, bold |
| retro-70s | Retro 70s / ريترو السبعينات | retro-groovy, citrus-pop, apricot-sunset, honey-oat | waves 3, pattern:stripes 1, blobs 1 | solid · bold, fill | flower, sun, smiley | fraunces | retro, playful |
| checkerboard | Checkerboard / مربعات | checker-indie, bubblegum, mint-sorbet, lilac-dream | pattern:checker 3, pattern:gingham 2 | solid, outline · bold, regular | smiley, star | space-grotesk | playful, retro |
| noir-mono | Noir Mono / أبيض وأسود | noir, grunge, cloud-nine | mesh 2, pattern:grid 2, waves 1 | solid, outline · thin, regular | — | fraunces, space-grotesk | minimal, elegant |
| grunge | Grunge / غرنج | grunge, emo-pink, noir | mesh 2, pattern:grid 1, scatter 1 | outline, solid · bold | skull, lightning, star | space-grotesk | edgy, dark |
| emo | Emo / إيمو | emo-pink, midnight-y2k, noir | pattern:checker 2, scatter 2 | solid, outline · bold, fill | heart-break, skull, star | space-grotesk | edgy, dark |
| glassmorphism | Glassmorphism / زجاجي | lavender-haze, ocean-breeze, galaxy, aurora | blobs 3, mesh 2 | glass · regular, light | sparkle | readex-pro | minimal, dreamy |
| aurora-borealis | Aurora Borealis / الشفق القطبي | aurora, deep-ocean, forest-night | aurora 4, sky (night) 1 | glass, outline · regular | star, mountains | readex-pro | calm, mysterious · winter |
| forest-moss | Forest & Moss / غابة وطحالب | forest-night, sage-garden, matcha-latte | waves 2, blobs 2, scatter 1 | solid, wallpaper · regular, duotone | leaf, tree, mountains | fraunces | calm, cozy |
| desert-sand | Desert Sand / رمال الصحراء | vanilla-sky, honey-oat, apricot-sunset, clean-girl | waves 3, mesh 2 | solid, outline · light, regular | sun, cactus | fraunces, el-messiri | calm, minimal |
| autumn-cozy | Autumn Cozy / خريف دافئ | espresso, honey-oat, retro-groovy | waves 2, scatter 2, mesh 1 | solid · regular, duotone | leaf, coffee, umbrella | fraunces | cozy · autumn |
| winter-frost | Winter Frost / صقيع الشتاء | cloud-nine, baby-blue, deep-ocean | sky 2, scatter 2, mesh 1 | glass, solid · light, regular | snowflake, star | fraunces | calm · winter |
| holiday-cozy | Holiday Cozy / دفء الأعياد | holiday-cozy, wine, butter-cream | scatter 3, pattern:stars 1 | solid · fill, bold | gift, star, snowflake, tree-evergreen | fraunces, pacifico | cozy, playful · christmas |
| halloween | Halloween / هالوين | halloween, emo-pink, noir | scatter 3, sky (night) 1 | solid, outline · bold, fill | ghost, skull, moon-stars, spiral | space-grotesk | playful, dark · halloween |
| ramadan-lanterns | Ramadan Lanterns / فوانيس رمضان | ramadan-night, ramadan-cream, deep-ocean | sky (night) 3, pattern:stars 2, scatter 2 | solid, outline · regular, light | moon-stars, star, sparkle | el-messiri, fraunces | elegant, calm · ramadan |
| eid-gold | Eid Gold / ذهب العيد | ramadan-cream, ramadan-night, rose-gold, butter-cream | mesh 2, scatter 2, pattern:stars 1 | gradient, solid · regular, fill | sparkle, star, gift, moon-stars | el-messiri, fraunces | elegant, playful · eid |
| valentine | Valentine / عيد الحب | strawberry-milk, coquette, wine | pattern:hearts 3, scatter 2 | solid, gradient · fill, regular | heart, heart-straight, sparkle | pacifico, fraunces | romantic · valentine |
| summer-citrus | Summer Citrus / صيف الحمضيات | citrus-pop, lemon-sorbet, apricot-sunset | scatter 2, blobs 2, waves 1 | solid · bold, fill | sun, orange-slice, waves | space-grotesk | fresh, playful · summer |
| spring-garden | Spring Garden / حديقة الربيع | pistachio, sakura, mint-sorbet | scatter 3, blobs 1 | solid, gradient · regular, duotone | flower, flower-tulip, butterfly, plant | fraunces | fresh, cute · spring |
| bauhaus-geo | Bauhaus Geo / هندسي باوهاوس | bauhaus, retro-groovy, checker-indie | shapes 4 | solid · bold, fill | — | space-grotesk | bold, retro |
| leopard-luxe | Leopard Luxe / فهدي فاخر | leopard-luxe, rose-gold, noir | pattern:leopard 4 | solid, wallpaper · regular, fill | crown, diamond, sparkle | fraunces | elegant, bold |
| gamer-rgb | Gamer RGB / ألعاب RGB | cyber-neon, galaxy, vaporwave | aurora 2, pattern:grid 2 | outline, glass · bold | game-controller, lightning, sword | jetbrains-mono | bold, edgy |
| football-night | Football Night / ليلة كرة القدم | forest-night, deep-ocean, noir | pattern:stripes 2, mesh 2 | solid · bold, fill | soccer-ball, trophy, star | space-grotesk | bold |
| dreamy-sky | Dreamy Sky / سماء حالمة | baby-blue, cloud-nine, apricot-sunset | sky 4, mesh 1 | glass, solid · regular, light | cloud, sun, star | fraunces | dreamy, calm |
| butterfly-dreams | Butterfly Dreams / أحلام الفراشات | lilac-dream, cotton-candy, midnight-y2k, sakura | scatter 3, mesh 2 | gradient, glass · regular, fill | butterfly, sparkle, flower | pacifico, fraunces | dreamy, cute |

Body font for all recipes: `readex-pro`. No sports-club, brand, film, anime or celebrity references — ever.

---

## 3. Wallpaper generators (`lib/render/wallpaper/*.ts`)

All draw into a `viewBox="0 0 {w} {h}"` so they scale to any resolution. Colours come from `spec.wallpaper.colors ?? derive(palette)`. All sizes are relative to `w`/`h`.

| Kind | Algorithm | Notes |
|---|---|---|
| `mesh` | bg rect + `points` radial gradients at PRNG positions (radius 0.6–1.1 × max(w,h), stop opacity 1 → 0) + one `feGaussianBlur` on the group (σ = softness × 0.08 w) | Smooth "mesh gradient" look |
| `blobs` | `count` closed shapes from 6–9 polar points with radius jitter → Catmull-Rom → cubic Bézier; size 0.3–0.7 w; blur σ = blur × 0.06 w; base = linear gradient bg → surface | — |
| `waves` | `layers` bands from bottom; each top edge = sum of 2 sines (amplitude × 0.08 h, 1–3 cycles per width × frequency, PRNG phase); colours interpolated primary → accent | Calm top area for the clock |
| `pattern` | SVG `<pattern>` tile = scale × 0.12 w, `patternTransform` rotation. `checker`, `gingham` (two translucent stripe sets), `dots` (offset rows), `stripes`, `grid` (hairlines), `y2k-grid` (perspective grid on a gradient sky: horizon + converging lines + horizontals with growing spacing), `hearts`/`stars` (decor glyph tiles), `bows` (our own bow path in `lib/render/shapes/bow.ts`), `leopard` (irregular spots with partial darker rims, Poisson-distributed) | Original artwork only |
| `scatter` | gradient base; Poisson-disk positions (min distance from size); glyph per point from `glyphs`, size `sizeMin..sizeMax × w`, ±25° rotation if `rotate`, colour from primary/accent/surface at 0.7–1 opacity; `density` → 8–60 points | Keep the top 22% calmer (clock area): lower density there |
| `aurora` | dark base; `bands` thick curved strokes along Bézier paths with gradient strokes; heavy blur (σ 0.05–0.1 w); faint stars when palette is dark | — |
| `sky` | `day`: vertical gradient; `sunset`: accent → primary → bg; `night`: deep gradient + Poisson stars (radius variance) + crescent moon (circle masked by offset circle). Clouds = clusters of blurred ellipses | — |
| `shapes` | 3 × 6 grid; each cell a primitive (circle, half/quarter circle, rect, triangle, arch) rotated by multiples of 90°, palette colours; `density` = fill ratio | Bauhaus |
| `image` | photo drawn by the rasterizer; SVG holds only dim + overlays | see `docs/01` §4.2 |

`lockWallpaper = 'variant'` → same kind, `seed + 1`, density/amplitude × 0.7 for a calmer clock area.

Grain: post-process (seeded noise tile), `0` = off. Recipes use 0.04–0.14.

---

## 4. Icons (`lib/render/icon.ts`)

`renderIcon(style, glyphMarkup, { size, platform: 'ios' | 'shaped', palette, glyphs, wallpaper?, prefix? })` returns `RenderResult`. Explicit palette and glyph-source context resolves glass fills and sticker glyphs without ambient state. An optional rendered wallpaper supplies wallpaper fills and photo placement. `prefix` avoids SVG id collisions in compositions.

- **iOS**: opaque, full-bleed square (iOS applies its own mask; transparent pixels render black). `shape` is ignored.
- **Shaped** (Android/desktop): composition clipped to `squircle` (superellipse n = 5, 64 points), `circle`, `rounded` (r = 22%) or `square`; outside transparent.
- Fills: `solid` (bg) · `gradient` (bg → bg2, 135°) · `glass` (mix(primary, surface, 0.6) + top white highlight 18% + inner 1px light border) · `outline` (palette bg + inset stroke 8% in border/primary colour) · `pattern` (surface + mini dots/checker in accent at 18%) · `wallpaper` (scaled crop of the wallpaper + 25% dim, glyph shadow forced on).
- Glyph: Phosphor markup (viewBox 0 0 256 256) inside `<g color="{glyphColor}" fill="currentColor" transform=…>` centred at `glyphScale`. Optional `feDropShadow` when `shadow`.
- Border ring: `border.width × size`. Sticker: small circle (22% size) at `corner` with a decor glyph.

## 5. Widgets (`lib/render/widgets.ts`)

Used in previews and as static decor exports (no text in exports): `glyphBadge` (small), `ring` (small, progress ring + glyph), `stickerCollage` (medium, 3–5 decor glyphs), `photoFrame` (large, framed empty area with decor corners). Server previews may add digits (time) because they are language-neutral.

## 6. Previews (`lib/render/preview.ts`)

- `renderHomePreview(spec, glyphs, apps, { w, h, prefix? })`: generic phone silhouette, status bar (digits + cell/wifi/battery glyphs), one medium widget, 4 × 4 icons from the 16 top-ranked catalogue apps, dock with 4 icons on a glass panel. Apps are explicit ranked catalog input; labels are rounded pills (no words).
- `renderLockPreview(spec, glyphs, { w, h, prefix? })`: big time "10:24" in the display font, two small widgets, lock wallpaper. Time colour = white or ink, whichever contrasts better with the top-area colour estimate.
- Clocks use generated font outlines from `content/clock-outlines.json`, rather than SVG text needing external fonts. Both functions return `RenderResult`, preserving image placement, deterministic noise and warnings.

---

## 7. Spec builder (`server/services/theme-generate.ts` uses `lib/render/build-spec.ts`)

```
buildSpec(recipe, palette, rng):
  p          = { ...palette, inkMuted: mixOklab(ink, bg, 0.38) }
  wallpaper  = makeWallpaper(weightedPick(recipe.wallpapers, rng), p, recipe.decor, rng)
  lock       = recipe.lockWallpaper === 'same' ? null : variantOf(wallpaper, rng)
  fill       = pick(recipe.icons.fills)
  colours    = resolveIconColours(fill, p)          // candidates ranked by WCAG contrast; null if none ≥ 3:1
  icons      = { shape: pick([squircle×3, rounded, circle]), fill, …colours, glyphWeight: pick(weights),
                 glyphScale: range(scale), border: chance ? { width: 0.03, color: p.primary } : null,
                 sticker: chance ? { glyph: pick(decor), color: p.accent, corner: pick(['tr','tl']) } : null,
                 shadow: chance }
  widgets    = { style: pick(styles), radius: range, surface: p.surface, ink: p.ink, accent: p.accent }
  type       = { display: pick(fonts.display), body: 'readex-pro' }
  decor      = sample(recipe.decor, ≤ 3)
  return themeSpecSchema.parse({ v: 1, palette: p, wallpaper, lockWallpaper: lock, icons, widgets, type, decor })
```

Icon colour candidates: `solid` → (primary / surface|ink), (surface / primary|ink), (accent / ink). `gradient` → (primary→accent / surface|ink), contrast = min over both stops. `glass` → glyph ink|primary. `outline` → glyph primary|ink on bg. `pattern` → glyph ink|primary on surface. `wallpaper` → glyph surface with shadow, contrast vs palette.primary.

---

## 8. Automated QA (generator rejects silently, counts in `generation_runs.skipped_qa`)

1. `themeSpecSchema` valid.
2. Icon glyph contrast ≥ 3:1 against its background (gradient: both stops).
3. Visible palette: OKLab ΔE(bg, primary) ≥ 0.08 and ΔE(primary, accent) ≥ 0.06.
4. All glyph names exist in the manifest.
5. **Duplicate check**: render a 72 × 156 thumbnail (resvg), dHash (sharp: greyscale → 9 × 8 → 64 bits). Hamming distance ≤ 6 against any existing theme (draft/pending/approved/published) or earlier candidate in the same run → skip (`skipped_duplicates`).
6. At publish: phone JPEG ≤ 3,000,000 bytes (else re-encode at q88), thumb ≤ 80,000 bytes. Thumbnails start at WebP q80; bounded lower-quality retries use the original resized preview, then publication fails if the size still exceeds the budget.

Oversample: generate `count × 3` candidates to hit `count` accepted drafts; stop early when reached.

---

## 9. Names, descriptions, tags

- EN name: `${palette.nameEn} ${recipe.shortEn}` → "Lavender Haze Y2K". Collision → append " II", " III"…
- AR name: `${recipe.nameAr}: ${palette.nameAr}` → "واي تو كي: ضباب اللافندر". Collision → append " 2", " 3"… (this form avoids Arabic adjective-agreement mistakes).
- Slug: `slugify(nameEn)` + `-` + 4 base36 chars → `lavender-haze-y2k-k3f9`. Immutable after first publish.
- Descriptions: recipe descriptions (EN/AR). Admin can edit.
- Tags: the aesthetic tag; recipe moods (≤ 3); style tags derived from wallpaper kind (`mesh|blobs|aurora → gradient`, `pattern → pattern`, `scatter → illustrated`, `sky → illustrated`, `shapes → pattern`, `image → photo`, glass fill → `glass`, neon palettes → `neon`, noir/grunge → `monochrome`, light pastel palettes → `pastel`); season tag when present. `tags_text` = every tag's EN + AR names joined by spaces.
- `color_family`: provisional from palette (primary/bg) at generation; final from the rendered preview's dominant colour at publish (OKLCH buckets: chroma < 0.04 → black (L < 0.25) / white (L > 0.85) / gray; else hue: red 345–20, orange 20–55, yellow 55–100, green 100–160, teal 160–200, blue 200–260, purple 260–300, pink 300–345; orange/red/yellow with L < 0.5 and C < 0.12 → brown; ≥ 3 families among the top-3 palette colours → multi).

## 10. Tag seed (`scripts/seed-taxonomy.ts`)

- **aesthetic**: the 40 recipes above.
- **mood**: cute لطيف · calm هادئ · dreamy حالم · bold جريء · dark داكن · cozy دافئ · elegant أنيق · playful مرح · minimal بسيط · retro ريترو · edgy متمرّد · romantic رومانسي · fresh منعش · mysterious غامض.
- **season**: spring الربيع · summer الصيف · autumn الخريف · winter الشتاء · ramadan رمضان · eid العيد · halloween الهالوين · christmas الكريسماس · valentine عيد الحب · back-to-school العودة إلى المدرسة.
- **style**: pastel باستيل · gradient تدرّج · pattern نقشة · glass زجاجي · neon نيون · photo صورة · illustrated مرسوم · monochrome أحادي اللون.

## 11. Workflow & commands

```bash
npm run glyphs:build                                   # once, and after upgrading @phosphor-icons/core
npm run db:seed                                        # tags, app catalogue, default settings (idempotent upserts)
npm run themes:generate -- --aesthetic=y2k --count=12 --seed=2026
npm run themes:generate -- --all --count=12 --seed=2026      # every recipe
# review in /admin/review (P13). Local-only shortcut for development: --auto-approve (refused when VERCEL_ENV=production)
npm run themes:publish -- --status=approved --concurrency=3   # render + upload + publish, resumable
```

Admin UI equivalents: Generator page (≤ 24 per click), Review deck, Publish queue.

## 12. Creator photo themes

1. Client: pick image → decode (`createImageBitmap`) → longest edge ≤ 3000 px → JPEG q0.92 (strips EXIF/GPS, converts HEIC) → `createWallpaperUpload` → `PUT` to presigned URL → `finalizeWallpaperUpload`.
2. Server: size ≤ 15 MB (HeadObject), `sharp().rotate()`, min 1080 × 1920, aspect (w/h) 0.4–0.7, writes `full.jpg` (≤ 2868 px tall, q90) + `preview.webp`, deletes incoming, extracts palette (k-means k = 6 in OKLab on a 64 × 64 thumbnail, sorted by population).
3. Palette roles suggested: bg = most populous, primary = most saturated, accent = second most saturated, ink = darkest or lightest (whichever contrasts better with bg), surface = mix(bg, white/black, 0.85).
4. Studio offers 3 icon-style suggestions from a built-in "photo" recipe; creator adjusts focal point (tap) and dim, then submits.
5. Publish renders phone and tablet crops at the focal point. No desktop size for photo themes.

## 13. App catalogue (`content/apps.ts` → `apps` table)

Glyphs are generic Phosphor symbols. Names are text labels only. Rank ≤ 24 = default selection in the icon exporter.

| # | slug | name | category | glyph |
|---|---|---|---|---|
| 1 | phone | Phone | system | phone |
| 2 | messages | Messages | system | chat-circle-text |
| 3 | camera | Camera | system | camera |
| 4 | photos | Photos | system | images |
| 5 | settings | Settings | system | gear-six |
| 6 | safari | Safari | system | compass |
| 7 | whatsapp | WhatsApp | messaging | chat-circle-dots |
| 8 | instagram | Instagram | social | aperture |
| 9 | tiktok | TikTok | social | music-notes |
| 10 | snapchat | Snapchat | social | ghost |
| 11 | youtube | YouTube | media | play |
| 12 | spotify | Spotify | music | headphones |
| 13 | mail | Mail | system | envelope-simple |
| 14 | calendar | Calendar | system | calendar-blank |
| 15 | clock | Clock | system | clock |
| 16 | weather | Weather | system | cloud-sun |
| 17 | maps | Maps | system | map-trifold |
| 18 | notes | Notes | system | note-pencil |
| 19 | music | Music | music | music-note |
| 20 | app-store | App Store | system | storefront |
| 21 | x | X | social | chat-teardrop-text |
| 22 | facebook | Facebook | social | users-three |
| 23 | telegram | Telegram | messaging | paper-plane-tilt |
| 24 | netflix | Netflix | media | film-slate |
| 25 | pinterest | Pinterest | social | push-pin |
| 26 | threads | Threads | social | at |
| 27 | discord | Discord | messaging | headset |
| 28 | messenger | Messenger | messaging | chat-circle |
| 29 | gmail | Gmail | productivity | envelope |
| 30 | google | Google | utilities | magnifying-glass |
| 31 | chrome | Chrome | utilities | globe |
| 32 | google-maps | Google Maps | travel | map-pin |
| 33 | google-photos | Google Photos | photo | image |
| 34 | google-drive | Google Drive | productivity | folder |
| 35 | chatgpt | ChatGPT | ai | robot |
| 36 | gemini | Gemini | ai | sparkle |
| 37 | claude | Claude | ai | asterisk |
| 38 | reminders | Reminders | system | list-checks |
| 39 | calculator | Calculator | system | calculator |
| 40 | facetime | FaceTime | system | video-camera |
| 41 | contacts | Contacts | system | address-book |
| 42 | files | Files | system | folder-simple |
| 43 | health | Health | health | heartbeat |
| 44 | wallet | Wallet | finance | wallet |
| 45 | find-my | Find My | system | crosshair |
| 46 | podcasts | Podcasts | media | microphone |
| 47 | books | Books | education | book-open |
| 48 | news | News | news | newspaper |
| 49 | home | Home | utilities | house |
| 50 | fitness | Fitness | health | person-simple-run |
| 51 | translate | Translate | utilities | translate |
| 52 | shortcuts | Shortcuts | utilities | squares-four |
| 53 | voice-memos | Voice Memos | utilities | waveform |
| 54 | tv | TV | media | television |
| 55 | passwords | Passwords | utilities | key |
| 56 | journal | Journal | lifestyle | notebook |
| 57 | linkedin | LinkedIn | social | briefcase |
| 58 | reddit | Reddit | social | chats-circle |
| 59 | twitch | Twitch | media | television-simple |
| 60 | bereal | BeReal | social | camera-plus |
| 61 | tumblr | Tumblr | social | pen |
| 62 | wechat | WeChat | messaging | chat-dots |
| 63 | signal | Signal | messaging | chat-centered-dots |
| 64 | zoom | Zoom | productivity | video |
| 65 | teams | Microsoft Teams | productivity | users-four |
| 66 | outlook | Outlook | productivity | envelope-open |
| 67 | notion | Notion | productivity | note-blank |
| 68 | slack | Slack | productivity | hash |
| 69 | google-docs | Google Docs | productivity | file-text |
| 70 | word | Word | productivity | file-doc |
| 71 | excel | Excel | productivity | table |
| 72 | canva | Canva | photo | paint-brush |
| 73 | capcut | CapCut | photo | scissors |
| 74 | vsco | VSCO | photo | circle-half |
| 75 | lightroom | Lightroom | photo | sliders |
| 76 | picsart | Picsart | photo | magic-wand |
| 77 | youtube-music | YouTube Music | music | music-notes-simple |
| 78 | soundcloud | SoundCloud | music | cloud |
| 79 | shazam | Shazam | music | ear |
| 80 | anghami | Anghami | music | music-note-simple |
| 81 | prime-video | Prime Video | media | play-circle |
| 82 | disney-plus | Disney+ | media | film-reel |
| 83 | shahid | Shahid | media | film-strip |
| 84 | kindle | Kindle | education | book |
| 85 | audible | Audible | education | speaker-high |
| 86 | duolingo | Duolingo | education | graduation-cap |
| 87 | amazon | Amazon | shopping | package |
| 88 | shein | SHEIN | shopping | t-shirt |
| 89 | temu | Temu | shopping | shopping-cart |
| 90 | noon | noon | shopping | shopping-bag |
| 91 | ebay | eBay | shopping | tag |
| 92 | etsy | Etsy | shopping | handbag-simple |
| 93 | vinted | Vinted | shopping | coat-hanger |
| 94 | depop | Depop | shopping | handbag |
| 95 | paypal | PayPal | finance | hand-coins |
| 96 | revolut | Revolut | finance | credit-card |
| 97 | monzo | Monzo | finance | bank |
| 98 | my-bank | My Bank | finance | piggy-bank |
| 99 | uber | Uber | travel | car |
| 100 | careem | Careem | travel | car-simple |
| 101 | bolt | Bolt | travel | lightning |
| 102 | airbnb | Airbnb | travel | house-line |
| 103 | booking | Booking.com | travel | bed |
| 104 | trainline | Trainline | travel | train |
| 105 | citymapper | Citymapper | travel | path |
| 106 | waze | Waze | travel | navigation-arrow |
| 107 | uber-eats | Uber Eats | food | hamburger |
| 108 | deliveroo | Deliveroo | food | bicycle |
| 109 | talabat | talabat | food | moped |
| 110 | just-eat | Just Eat | food | bowl-food |
| 111 | starbucks | Starbucks | food | coffee |
| 112 | strava | Strava | health | sneaker-move |
| 113 | myfitnesspal | MyFitnessPal | health | fork-knife |
| 114 | calm | Calm | health | moon |
| 115 | flo | Flo | health | drop |
| 116 | roblox | Roblox | games | cube |
| 117 | minecraft | Minecraft | games | hammer |
| 118 | pubg | PUBG Mobile | games | target |
| 119 | clash-royale | Clash Royale | games | crown |
| 120 | candy-crush | Candy Crush | games | cookie |
| 121 | pokemon-go | Pokémon GO | games | game-controller |
| 122 | steam | Steam | games | joystick |
| 123 | playstation | PlayStation | games | game-controller |
| 124 | lemon8 | Lemon8 | social | orange-slice |
| 125 | letterboxd | Letterboxd | media | ticket |

`scripts/generate-glyphs.ts` and `scripts/seed-apps.ts` must fail loudly listing any glyph name missing from the installed `@phosphor-icons/core` (names change between versions) — fix the table, never ship blanks. Users can also make a **custom icon for any app**: name + any glyph from the full manifest.

## 14. Weekly operations & seasonal calendar

- Weekly (≈ 1 hour): generate 2–3 aesthetics × 12 → review (target 60–70% approval) → publish → add to a collection → feature 3 on Home.
- Monthly: retire low performers from Home (never delete published themes — archive only if broken/reported).
- Seasonal collections, scheduled ~3 weeks ahead (Islamic dates are approximate — confirm with official moon-sighting announcements):
  - Winter & Christmas: 1 Dec – 31 Dec
  - Valentine's: 1 – 14 Feb
  - Ramadan 2027: ≈ 7 Feb – 8 Mar 2027
  - Eid al-Fitr 2027: ≈ 9 – 12 Mar 2027
  - Eid al-Adha 2027: ≈ 16 – 19 May 2027
  - Summer: Jun – Aug · Back to school: late Aug – Sep · Halloween: 1 – 31 Oct

## 15. Licensing rules for content

- Generated wallpapers and icons are original works produced by our code from our palettes.
- Phosphor glyphs (MIT): keep the licence in `public/glyphs/LICENSE.txt` and credit in `/legal/copyright`.
- Fonts: OFL; credit in `/legal/copyright`; ship `OFL.txt` files.
- Creator uploads: creator confirms ownership at upload; takedown flow via reports.
- Never import images from Pinterest, Google Images, wallpaper sites, stock sites, or AI tools whose terms you have not checked for commercial redistribution.
