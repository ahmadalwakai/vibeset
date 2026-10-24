# Vibeset — Design System

Mobile-first, soft and polished, fast. Built on Chakra UI v3 tokens in `design/`. **Components never use raw hex values or px magic numbers** — only tokens and semantic tokens defined here.

`design/system.ts` composes Chakra's public `defaultBaseConfig`, the explicit defaults in `design/base-config.ts` and Vibeset's overrides. All default tokens, conditions, utilities, global styles and the 14 ordinary/24 slot recipes used by repository components are retained; unused recipes are omitted to reduce the shared client configuration. When introducing a new Chakra component or snippet, check its recipe and transitive indicators/loading controls and add any missing defaults before using it. Do not reintroduce the complete `defaultConfig` or recipe maps without measuring the client cost.

Legal documents use the installed Chakra CLI's `components/ui/prose.tsx` snippet for semantic paragraphs, lists and headings, with token borders/shadows, underlined links and visible keyboard focus. Literal scoped selectors retain strict style types without unchecked assertions; explicit RTL overrides preserve zero tracking, normal emphasis and the documented ×1.1 body/heading line height. It needs no additional component recipes. The document page supplies one `h1`; body sections start at `h2`. Legal prose lives in typed locale TSX; interactive control and notice strings stay in matching `messages` keys.

---

## 1. Brand

- Wordmark: lowercase `vibeset` in the display font; a four-point sparkle replaces the dot of the "i".
- App icon / favicon: white sparkle on the brand gradient squircle.
- Brand gradient: `linear-gradient(135deg, {colors.brand.500} 0%, {colors.peach.400} 100%)` — hero accents, app icon, Studio CTA. Never behind body text.
- Personality: soft, playful, confident. Rounded shapes, generous spacing, glassy chrome, colour comes from the themes themselves — the UI chrome stays calm.

---

## 2. Colour tokens (`design/tokens.ts`)

### brand (orchid)

| 50      | 100     | 200     | 300     | 400     | 500     | 600     | 700     | 800     | 900     | 950     |
| ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- |
| #fbf3fd | #f5e3fa | #ecc6f5 | #de9eed | #cc70e2 | #b44bd0 | #9734b1 | #7a2990 | #5f2271 | #491b56 | #2d0d36 |

### peach (accent)

| 50      | 100     | 200     | 300     | 400     | 500     | 600     | 700     | 800     | 900     | 950     |
| ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- |
| #fff5ef | #ffe8db | #ffceb4 | #ffae86 | #ff8b58 | #f86e39 | #e2522a | #ba3f21 | #94341f | #772e1e | #40140c |

### neutral (mauve-tinted grey)

| 50      | 100     | 200     | 300     | 400     | 500     | 600     | 700     | 800     | 900     | 950     |
| ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- |
| #faf8fc | #f3f0f6 | #e5e0eb | #cdc6d7 | #a89eb6 | #837894 | #665c76 | #50475e | #373042 | #231e2c | #16121d |

Keep Chakra's default palettes (red, green, yellow…) for status colours.

---

## 3. Semantic tokens (`design/semantic-tokens.ts`)

Override Chakra's built-in semantic tokens so every v3 component inherits the brand. Format: `{ value: { base: …, _light: …, _dark: … } }`, with `_light` equal to `base`. The explicit `_light` replaces inherited Chakra light-mode values when our configuration merges with the retained Chakra defaults; a `base` override alone leaves those inherited conditional values active.

| Token               | Light (`base`) | Dark (`_dark`) |
| ------------------- | -------------- | -------------- |
| `bg` (DEFAULT)      | neutral.50     | neutral.950    |
| `bg.panel`          | white          | neutral.900    |
| `bg.subtle`         | neutral.100    | neutral.900    |
| `bg.muted`          | neutral.100    | neutral.800    |
| `bg.emphasized`     | neutral.200    | neutral.700    |
| `fg` (DEFAULT)      | neutral.950    | neutral.50     |
| `fg.muted`          | neutral.600    | neutral.400    |
| `fg.subtle`         | neutral.500    | neutral.500    |
| `border` (DEFAULT)  | neutral.200    | neutral.800    |
| `border.muted`      | neutral.100    | neutral.900    |
| `border.emphasized` | neutral.300    | neutral.700    |

`colorPalette="brand"` support (all seven keys are required by Chakra v3):

| Token              | Light     | Dark      |
| ------------------ | --------- | --------- |
| `brand.solid`      | brand.600 | brand.400 |
| `brand.contrast`   | white     | brand.950 |
| `brand.fg`         | brand.700 | brand.300 |
| `brand.muted`      | brand.100 | brand.900 |
| `brand.subtle`     | brand.50  | brand.950 |
| `brand.emphasized` | brand.200 | brand.800 |
| `brand.focusRing`  | brand.400 | brand.400 |

Same seven keys for `peach` with `peach.solid` = peach.500 / peach.400 and **`peach.contrast` = neutral.950 in both modes** (white on peach fails contrast).

Verified contrast: white on brand.600 ≈ 6.1:1; brand.950 on brand.400 ≈ 5.7:1; brand.700 on white ≈ 8.2:1; fg.muted on bg ≈ 5.9:1 (light) / 7.2:1 (dark).

Extra semantic tokens:

| Token           | Light                    | Dark                  | Use                                                                             |
| --------------- | ------------------------ | --------------------- | ------------------------------------------------------------------------------- |
| `chrome.bg`     | `rgba(250,248,252,0.78)` | `rgba(22,18,29,0.72)` | glass app bar / bottom nav (with `backdropFilter: 'saturate(180%) blur(16px)'`) |
| `card.bg`       | white                    | neutral.900           | cards                                                                           |
| `overlay.scrim` | `rgba(22,18,29,0.45)`    | `rgba(0,0,0,0.6)`     | sheets backdrop                                                                 |

---

## 4. Typography (`design/fonts.ts` + tokens)

| Role               | Family (next/font/google)                                           | Notes                                                                         |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Body (EN + AR)     | **Readex Pro** (subsets `latin`, `arabic`)                          | One family for both scripts                                                   |
| Display            | **Fraunces** (latin) with **El Messiri** (arabic) next in the stack | Browser falls back per glyph: Arabic text renders in El Messiri automatically |
| Theme preview only | Pacifico, Space Grotesk, JetBrains Mono (+ the above)               | `preload: false`; only downloaded when a preview uses them                    |

CSS variables: `--font-body`, `--font-display`, `--font-pacifico`, `--font-space-grotesk`, `--font-jetbrains-mono`, `--font-el-messiri`, `--font-fraunces`, `--font-readex`. Chakra `fonts.body` = `var(--font-body), system-ui, sans-serif`; `fonts.heading` = `var(--font-display), var(--font-el-messiri), Georgia, serif`.

Text styles (`textStyles`):

| Name          | Size / line-height        | Weight |
| ------------- | ------------------------- | ------ |
| `display.2xl` | 48px / 1.05 (mobile 36px) | 650    |
| `display.xl`  | 36px / 1.1 (mobile 28px)  | 650    |
| `display.lg`  | 28px / 1.15               | 600    |
| `heading.md`  | 20px / 1.3                | 600    |
| `heading.sm`  | 17px / 1.35               | 600    |
| `body.md`     | 16px / 1.55               | 400    |
| `body.sm`     | 14px / 1.5                | 400    |
| `caption`     | 12px / 1.4                | 500    |

Arabic (`_rtl`): line-height × 1.1, `letterSpacing: 0`, no uppercase transforms, no italics. Latin display uses `letterSpacing: '-0.02em'`. Stats use `fontVariantNumeric: 'tabular-nums'`.

Server rendering needs TTFs in `assets/fonts/`: `scripts/fetch-fonts.ts` downloads each family's `.ttf` and `OFL.txt` from the `google/fonts` GitHub repo (`ofl/readexpro`, `ofl/fraunces`, `ofl/elmessiri`, `ofl/pacifico`, `ofl/spacegrotesk`, `ofl/jetbrainsmono`) using the GitHub contents API. Most are variable fonts; resvg renders their default instance, which is enough for language-neutral previews (digits only). Commit the files with their `OFL.txt`.

---

## 5. Spacing, radii, shadows, layout

- Spacing: Chakra default 4px scale. Page gutter `{ base: 4, md: 6, lg: 8 }`. Max content width `container.xl` = 1280px.
- Radii tokens: `card` 24px, `sheet` 28px (top corners), `input` 14px, `chip` full, `button` full, `phone` 44px (at 360 px frame width — scale proportionally).
- Shadows (semantic, base/_dark):
  - `card`: `0 1px 2px rgba(22,18,29,.06), 0 8px 24px -8px rgba(22,18,29,.14)` / `0 1px 2px rgba(0,0,0,.4), 0 12px 32px -12px rgba(0,0,0,.6)`
  - `float`: `0 12px 40px -12px rgba(22,18,29,.28)` / `0 16px 48px -12px rgba(0,0,0,.7)`
- Breakpoints: Chakra defaults (sm 480, md 768, lg 1024, xl 1280, 2xl 1536). Design for 360–430 px first.
- Border widths: `hairline` = 1px, defined in `design/tokens.ts` for panel and divider borders.
- Viewport: `export const viewport = { viewportFit: 'cover', themeColor: [{ media: '(prefers-color-scheme: light)', color: '#faf8fc' }, { media: '(prefers-color-scheme: dark)', color: '#16121d' }] }`.
- Safe areas: bottom nav and sticky bars add `env(safe-area-inset-bottom)`.

---

## 6. Motion (`design/motion.ts` + Chakra tokens)

Tokens: `durations` instant 80ms · fast 140ms · moderate 220ms · slow 320ms · slower 480ms. `easings` standard `cubic-bezier(0.2,0,0,1)` · decelerate `cubic-bezier(0,0,0.2,1)` · accelerate `cubic-bezier(0.4,0,1,1)` · emphasized `cubic-bezier(0.05,0.7,0.1,1)`.

Springs for `motion` (`design/motion.ts`):

```ts
export const springs = {
  sheet: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 },
  pop: { type: 'spring', stiffness: 600, damping: 18 },
  layout: { type: 'spring', stiffness: 320, damping: 32 },
} as const;
```

Rules:

1. Animate only `transform` and `opacity`. Never width/height/top/left.
2. Feedback ≤ 220 ms; entrances ≤ 320 ms; nothing blocks input.
3. Grid entrance: fade-up (`y: 12 → 0`, opacity) with 30 ms stagger for the **first 12 cards only**; cards added by infinite scroll fade in without stagger.
4. `<MotionConfig reducedMotion="user">` at the root. With reduced motion: no transforms, opacity fades ≤ 100 ms.
5. Wrap Chakra components with motion wrappers (`components/common/motion.tsx`: `FadeIn`, `StaggerGrid`, `PressScale`, `PopIn`) — don't pass motion props to Chakra components (prop conflicts on `transition`).
6. No scroll-jacking. Header hide-on-scroll uses `useScroll` + transform only.

Signature interactions:

| Element        | Interaction                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ThemeCard      | hover (pointer devices only, `@media (hover: hover)`): lift −4 px + `shadow.float`, 220 ms standard. Press: scale 0.98, 80 ms |
| FavoriteButton | heart scale 1 → 1.3 → 1 (`springs.pop`) + 6-particle burst (CSS keyframes, 450 ms) + fill transition; `aria-pressed`          |
| Sheets         | slide up with `springs.sheet`; drag handle; drag-to-dismiss when offset > 30% or velocity > 500 px/s                          |
| Bottom nav     | active pill shared `layoutId`; icon weight regular → fill                                                                     |
| Studio         | swatch selection ring `layoutId`; wallpaper change crossfade 160 ms; shuffle icon rotates 180°                                |
| Icon export    | progress bar + count; finished icons pop into a grid preview                                                                  |
| Optional (P15) | React 19.2 `<ViewTransition>` thumbnail → detail morph behind `experimental.viewTransition`                                   |

---

## 7. Layout patterns

**Site — mobile**: glass top app bar 56 px (wordmark at start, search icon, overflow menu: language, colour mode, account) that hides on scroll down and reappears on scroll up. Glass bottom tab bar 64 px + safe area: Home (house), Explore (magnifying-glass), Studio (magic-wand), Saved (heart), Account (user-circle). Content gets matching bottom padding.

**Site — md+**: top nav (wordmark, Home, Explore, Studio, Saved, search, language switch, colour mode, user menu). P07 uses the full search input at lg+ and a search button at md to preserve a usable Arabic tablet header. The button links to `/explore?focus=1`, where the complete input is available. No bottom bar. Footer with legal links and language switch.

**Theme grid**: `SimpleGrid columns={{ base: 2, sm: 3, md: 4, xl: 5 }} gap={{ base: 3, md: 5 }}`. Card = CSS `aspectRatio={9 / 19.5}` Box with positioned image, `rounded="card"`, `bg={dominantColor}` placeholder, `loading="lazy"`, `decoding="async"`, `width/height` attributes; first row `fetchPriority="high"` and no lazy. CSS avoids Chakra's single-child check around streamed client previews. Cards use `contentVisibility: 'auto'` + `containIntrinsicSize`.

**Theme detail** — mobile: scroll-snap preview carousel (Home / Lock) with dots → title, creator, tags, stats → "More like this" → sticky bottom `ThemeActionBar` (Download ▾, Get icons, Remix, ♥; Share/Report in overflow). md+: two columns, previews sticky on the start side, info + actions on the end side.

**Studio** — mobile: preview top (~55dvh, pinch-free), bottom sheet with tabs (Colours, Wallpaper, Icons, Widgets, Type), toolbar row (undo, redo, shuffle, share, save, download). lg+: preview centre, 360 px panel on the end side, toolbar on top.

**Admin / Creator shells** — lg+: sidebar 248 px + content; below lg: top bar + drawer nav. Data tables collapse into card lists below md. Bulk selection uses Chakra `ActionBar` pinned to the bottom.

**Sheets**: `components/common/ResponsiveSheet.tsx` = Chakra `Drawer` with responsive placement (`{ base: 'bottom', md: 'end' }`), top radius `sheet`, drag handle on mobile.

---

## 8. Component inventory (build once, reuse everywhere)

| Component                                                  | Location          | Notes                                                                     |
| ---------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `PageHeader`                                               | common            | title, description, actions; mobile-condensed                             |
| `EmptyState`                                               | common            | Chakra `EmptyState` + Phosphor duotone glyph + action                     |
| `ErrorState`                                               | common            | translated message, retry, home link; never raw error text                |
| `ConfirmDialog`                                            | common            | destructive actions; typed confirmation for bulk deletes                  |
| `ResponsiveSheet`                                          | common            | see §7                                                                    |
| `InfiniteSentinel`                                         | common            | IntersectionObserver trigger with `rootMargin: '800px'`                   |
| motion wrappers                                            | common/motion.tsx | `FadeIn`, `StaggerGrid`, `PressScale`, `PopIn`                            |
| `ThemeCard` / `ThemeGrid` / `ThemeGridSkeleton`            | theme             | card link + separate `FavoriteButton` (no nested interactive elements)    |
| `PhoneFrame`                                               | theme             | generic phone silhouette (rounded rect + pill cutout), `dir="ltr"` always |
| `HomeScreenPreview` / `LockScreenPreview`                  | theme             | DOM previews rendered from spec (Studio, admin)                           |
| `ThemeActionBar`                                           | theme             | sticky bottom on mobile                                                   |
| `WallpaperDownloadSheet` / `IconExportSheet`               | theme             | heavy code via `next/dynamic` / dynamic `import()` on open                |
| `TagChip`, `ColorDot`, `StatPill`                          | common            | —                                                                         |
| `Steps` usage                                              | setup             | Chakra `Steps` for the iOS wizard                                         |
| `DataTable`, `BulkActionBar`, `StatCard`, `DownloadsChart` | admin             | Recharts inside a client component                                        |

Use the Chakra CLI snippets in `components/ui/` (`provider`, `color-mode`, `toaster`, `tooltip`, plus any snippet a component needs). Toasts: `toaster.create({ type, title, description })`.

---

## 9. States

| State              | Pattern                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| Loading (sections) | Skeletons with the final layout's shape. Spinners only inside buttons (`loading` prop) |
| Empty              | `EmptyState` with one clear action                                                     |
| Error (route)      | `error.tsx` → `ErrorState` with `reset()`                                              |
| Error (action)     | toast with translated `errors.{code}`; field errors inline                             |
| Optimistic         | update immediately (`useOptimistic` / local state), roll back + toast on failure       |
| Offline            | toast "You're offline" when `navigator.onLine === false` on an action                  |
| Disabled           | always explain why (tooltip or helper text, e.g. "Sign in to save")                    |
| Long tasks         | progress with count + cancel (icon export, bulk publish)                               |

---

## 10. RTL rules

- `<html dir>` from locale; Chakra `LocaleProvider` with `ar-SA` / `en-GB`.
- Logical props only: `ms/me`, `ps/pe`, `insetStart/insetEnd`, `borderStartWidth`, `roundedStart*`, `textAlign="start"`.
- Flip directional icons with `_rtl={{ transform: 'scaleX(-1)' }}` (arrows, chevrons, back). Never flip: play, check, clock, sparkle, phone previews.
- Phone previews are always `dir="ltr"`.
- Test every carousel/scroll-snap and drag gesture in RTL.

---

## 11. Accessibility (WCAG 2.2 AA)

- Contrast ≥ 4.5:1 for text, 3:1 for UI and focus indicators.
- Visible focus ring (`brand.focusRing`), skip link, landmarks (`header`, `nav`, `main`, `footer`).
- Icon-only buttons have translated `aria-label`. Touch targets ≥ 44 × 44 px.
- Images: `alt` = "{theme name} — home screen preview" (translated).
- Dialogs/sheets trap focus, close on Esc, return focus to the trigger.
- Async progress uses `aria-live="polite"`.
- `prefers-reduced-motion` (see §6) and `prefers-reduced-transparency` (solid `bg.panel` instead of glass).
- Admin keyboard shortcuts shown with `Kbd` and exposed via `aria-keyshortcuts`.

---

## 12. Copy

- English: sentence case, short, verb-first ("Get icons", "Save to Photos", "Remix").
- Arabic: native Modern Standard Arabic with a friendly tone ("احصل على الأيقونات"، "احفظ في الصور"، "عدّل الثيم"). Written by a native speaker, not machine-translated.
- Errors say what happened and what to do next. Never blame the user. Never show codes or stack traces.
- Every string lives in `messages/en.json` and `messages/ar.json` (same keys). No hard-coded UI text.
