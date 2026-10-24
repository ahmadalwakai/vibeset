---
description: 'UI rules — Chakra v3, RSC/client boundaries, i18n/RTL, motion, states, accessibility'
applyTo: 'app/**/*.tsx,components/**,hooks/**,design/**,messages/**'
---

# UI code

- **Server Components by default.** Add `'use client'` only for interactivity (state, effects, browser APIs, motion). Keep client components small and push data fetching up into Server Components.
- **Chakra v3**: import from `@chakra-ui/react`; use the CLI snippets in `components/ui/` (`Provider`, `ColorModeButton`, `toaster`, `Tooltip`…). Style with tokens/semantic tokens (`bg`, `bg.panel`, `fg.muted`, `border`, `brand.solid`, `rounded="card"`, `textStyle="display.lg"`). Use `colorPalette="brand"` on components. No raw hex, no `style={{}}` for design values. Compound components (`Drawer.Root`, `Dialog.Root`, `Menu.Root`, `Tabs.Root`, `Steps.Root`, `ActionBar.Root`, `EmptyState.Root`, `ColorPicker.Root`, `FileUpload.Root`…).
- **Stable style order**: when an element has both props, put `textStyle` before `color`. Chakra 3.37 memoizes equivalent style objects without considering their key order, but preserves the first result's CSS declaration order. Mixed prop orders can therefore produce different Emotion class hashes between streamed server rendering and hydration, even when the declarations have identical values.
  Keep identical sets of style props in the same order across components; aspect-ratio wrappers use `position`, `aspectRatio`, `overflow`, `rounded`, then `bg`. Use CSS `aspectRatio` Boxes with positioned children for streamed previews; Chakra's `AspectRatio` single-child check can fail for streamed client leaves.
- **Motion**: wrappers in `components/common/motion.tsx` (`FadeIn`, `StaggerGrid`, `PressScale`, `PopIn`); springs from `design/motion.ts`. Don't pass motion props to Chakra components. Transform/opacity only. Root has `<MotionConfig reducedMotion="user">`.
- **Dynamic data** (session, favourites, `searchParams`) renders inside `<Suspense fallback={<Skeleton…/>}>`. Skeletons mirror the final layout.
- **States**: every async surface has loading, empty (`EmptyState` with an action), error (`ErrorState` with retry) and success. Buttons show `loading` during actions. Explain disabled states.
- **Forms**: Chakra `Field` + controlled inputs; validate with the shared Zod schema from `lib/validation/` before calling the action; show `fieldErrors` from `ActionResult` under fields; disable submit while pending (`useTransition`/`useActionState`); toast on success/failure with translated text.
- **Optimistic UI** (`useOptimistic` or local state) must roll back on `ok: false` and show a toast.
- **Client fetching**: custom hooks in `hooks/` with `AbortController` (abort on unmount and on input change), stale-response guards (request id), dedupe by id. No polling unless specified.
- **i18n**: `useTranslations`/`getTranslations`; every string in both `messages/en.json` and `messages/ar.json` with identical keys (namespaces: `common`, `nav`, `home`, `explore`, `theme`, `studio`, `setup`, `saved`, `account`, `auth`, `creator`, `admin`, `errors`, `legal`). Navigation via `Link`/`useRouter` from `@/i18n/navigation`. Numbers via `Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB')`.
- **RTL**: logical props only (`ms`, `me`, `ps`, `pe`, `insetStart`, `insetEnd`, `borderStartWidth`, `textAlign="start"`). Flip directional icons with `_rtl={{ transform: 'scaleX(-1)' }}`. Phone previews `dir="ltr"`.
- **Images**: CDN images via Chakra `Image` (plain `<img>`) with `width`/`height`, `loading="lazy"`, `decoding="async"`, `alt` translated; first visible row eager + `fetchPriority="high"`. Placeholder background = `dominantColor`. Generated SVG via `<img src={svgDataUrl(svg)}>` only.
- **Accessibility**: semantic landmarks, labelled icon buttons (`aria-label` translated), focus-visible rings, 44 px targets, no interactive elements nested in links (card link + separate favourite button), `aria-live="polite"` for progress, sheets/dialogs from Chakra (focus trap, Esc).
- **Heavy code** (renderer, `fflate`, `lz-string`, `culori`, Recharts) only through `next/dynamic` or `import()` at the point of use.
- **Mobile-first**: write base styles for 360 px; add `md`/`lg` overrides after. Respect safe areas for fixed bars.
