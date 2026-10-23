---
description: 'P00 · Bootstrap — dependencies, Chakra system, config, env validation, tooling'
agent: 'agent'
---

# P00 · Bootstrap

Read first: [architecture](../../docs/01-architecture.md) · [design system](../../docs/04-design-system.md) · [global rules](../copilot-instructions.md)

## Goal

A clean Next.js 16 project with every dependency installed, the Chakra v3 design system in `design/`, validated env, strict tooling and a temporary page proving the setup works. No product features yet.

## Preconditions

- Project created with `create-next-app` exactly as in `START-HERE.md` (TypeScript, ESLint, App Router, **no `src/`**, **no Tailwind**, alias `@/*`).
- Workflow files copied in (`.github/`, `docs/`, `AGENTS.md`, `.env.example`). Node 24 LTS active.

## Tasks

1. **Versions**: run `npm ls next react`. If `next` < 16.3, run `npm i next@^16.3 react@~19.2 react-dom@~19.2 eslint-config-next@^16.3`. Add `"engines": { "node": ">=20.9.0" }` to `package.json` and create `.nvmrc` containing `24`.

2. **Install dependencies** (one go, then verify `npm ls` shows no peer-dependency errors):

   ```bash
   npm i @chakra-ui/react @emotion/react @emotion/cache next-themes motion@^12 @phosphor-icons/react next-intl zod better-auth drizzle-orm @neondatabase/serverless @vercel/functions @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp @resvg/resvg-js @phosphor-icons/core culori fflate lz-string resend server-only recharts
   npm i -D @chakra-ui/cli drizzle-kit dotenv-cli tsx vitest @vitest/coverage-v8 @playwright/test @types/culori prettier
   ```

3. **Chakra snippets**: `npx @chakra-ui/cli snippet add provider color-mode toaster tooltip`. Snippets must end up in `components/ui/` (check `npx @chakra-ui/cli snippet add --help` for the output-directory option if they land elsewhere). Do not edit snippet internals beyond what step 5 requires.

4. **Design system** (values exactly from `docs/04-design-system.md`):
   - `design/tokens.ts` — colour scales `brand`, `peach`, `neutral`; radii `card` 24px, `sheet` 28px, `input` 14px, `phone` 44px; durations; easings; fonts `body` = `var(--font-body), system-ui, sans-serif`, `heading` = `var(--font-display), var(--font-el-messiri), Georgia, serif`.
   - `design/semantic-tokens.ts` — overrides of Chakra built-ins (`bg`, `bg.panel`, `bg.subtle`, `bg.muted`, `bg.emphasized`, `fg`, `fg.muted`, `fg.subtle`, `border`, `border.muted`, `border.emphasized`) + all seven palette keys for `brand` and `peach` + `chrome.bg`, `card.bg`, `overlay.scrim` + shadows `card`, `float`. Format `{ value: { base: …, _light: …, _dark: … } }`, with `_light` equal to `base` so merging with `defaultConfig` replaces Chakra's inherited light-mode conditional values.
   - `design/text-styles.ts` — §4 table (responsive sizes for `display.*`).
   - `design/global-css.ts` — body bg/fg/font, antialiasing, `::selection` (`brand.muted`), `-webkit-tap-highlight-color: transparent`, `html[dir='rtl']` line-height ×1.1 and `letterSpacing: 0` on headings.
   - `design/motion.ts` — `springs` from §6.
   - `design/fonts.ts` — `next/font/google`: `Readex_Pro` (latin + arabic, `variable: '--font-readex'`), `Fraunces` (`--font-fraunces`), `El_Messiri` (arabic, `--font-el-messiri`), `Pacifico`, `Space_Grotesk`, `JetBrains_Mono` (preview fonts with `preload: false`). All `display: 'swap'`. Export `fontVariables` (joined class names) and define `--font-body: var(--font-readex)` and `--font-display: var(--font-fraunces)` in global CSS.
   - `design/system.ts` — `export const system = createSystem(defaultConfig, defineConfig({ theme: { tokens, semanticTokens, textStyles }, globalCss }))`.
   - Add script `"chakra:typegen": "chakra typegen ./design/system.ts"` (if the `chakra` bin isn't found, use `npx @chakra-ui/cli typegen ./design/system.ts`) and run it.

5. **Provider**: update `components/ui/provider.tsx` to pass `value={system}` from `@/design/system`, keep the color-mode provider (`attribute="class"`, `disableTransitionOnChange`), and wrap children in `<MotionConfig reducedMotion="user">` from `motion/react`.

   Wrap this provider in an Emotion registry using `@emotion/cache` and `useServerInsertedHTML`, per Chakra's Next.js streaming integration. Cache Components require this to keep server styles and client hydration in sync. Keep generated snippets' behavior; type-only lint fixes and required client directives for interactive snippets are permitted. The CLI's `react-icons` dependency is retained for its color-mode snippet.

6. **Motion wrappers**: `components/common/motion.tsx` (client) — `FadeIn`, `StaggerGrid` (staggers only the first 12 children, 30 ms), `PressScale`, `PopIn`, using `springs` and `useReducedMotion()` (no transforms when reduced).

7. **Env validation**:
   - `lib/env.server.ts` — Zod schema for every server key in `.env.example`; runtime guard `if (typeof window !== 'undefined') throw new Error('server env imported on client')`; **no `server-only` import** (CLIs load it). Refine: `E2E_TEST_AUTH === '1'` is rejected when `VERCEL_ENV === 'production'`. Support `SKIP_ENV_VALIDATION=1` for lint/typecheck-only CI. Export a typed `env`.
   - `lib/env.client.ts` — `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CDN_URL` (must be referenced as literal `process.env.NEXT_PUBLIC_…` so Next inlines them).
   - Test: `tests/unit/env.test.ts` covers the production/E2E refusal and a missing-key error message.

8. **next.config.ts**:

   ```ts
   const nextConfig: NextConfig = {
     cacheComponents: true,
     partialPrefetching: true,
     agentRules: false,
     poweredByHeader: false,
     experimental: { optimizePackageImports: ['@chakra-ui/react', '@phosphor-icons/react'] },
     serverExternalPackages: ['@resvg/resvg-js'],
     outputFileTracingIncludes: {
       '/api/admin/**': ['./public/glyphs/**/*', './assets/fonts/**/*'],
       '/[locale]/admin/**': ['./public/glyphs/**/*', './assets/fonts/**/*'],
     },
     async headers() {
       /* security headers + CSP from docs/01 §11; immutable cache for /glyphs/:path* */
     },
   };
   ```

   Build the CSP from a typed array so it stays readable; take the CDN origin from `process.env.NEXT_PUBLIC_CDN_URL`.

9. **TypeScript**: in `tsconfig.json` keep `strict: true` and add `noUncheckedIndexedAccess`, `noImplicitOverride`, `forceConsistentCasingInFileNames`. Alias `@/*` → `./*`.

10. **ESLint** (`eslint.config.mjs`, keep the generated Next config and append):
    - `@typescript-eslint/no-explicit-any: 'error'`, `@typescript-eslint/consistent-type-imports: 'error'`, `no-console: ['error', { allow: ['warn', 'error'] }]`.
    - `no-restricted-imports` everywhere: `@chakra-ui/icons`, `next/router`, `lodash`, `lodash/*`, `moment`, `axios`.
    - Override `lib/render/**`: also restrict `react`, `react-dom`, `next`, `next/*`, `fs`, `path`, `node:*`, `sharp`, `@resvg/resvg-js`, `@/server/*`, `@/db/*`; `no-restricted-globals`: `window`, `document`, `fetch`; `no-restricted-properties`: `Math.random`, `Date.now`.
    - Override `components/**`, `hooks/**`, `lib/client/**`: restrict `@/db/*`, `@/server/services/*`, `@/server/queries/*`, `@/server/admin-queries/*`, `@/server/storage/*`, `@/server/render/*`, `@/server/auth`, `@/lib/env.server` (client code may import `@/server/actions/*` only).

11. **Prettier**: `.prettierrc.json` `{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }` and `.prettierignore` (`.next`, `drizzle/migrations`, `public/glyphs`, `playwright-report`).

12. **Vitest**: `vitest.config.ts` — `environment: 'node'`, alias `@` → project root, include `tests/unit/**/*.test.ts` and `tests/integration/**/*.test.ts`; integration files call `describe.skipIf(!process.env.TEST_DATABASE_URL)`.

13. **package.json scripts**: `dev`, `build`, `start`, `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `format` (`prettier --write .`), `test` (`vitest run`), `test:watch`, `chakra:typegen`.

14. **.gitignore**: add `!.env.example`, `/playwright-report`, `/test-results`, `/blob-report`, `/.tmp`, `.vercel`.

15. **Temporary verification page**: replace the generated `app/layout.tsx` / `app/page.tsx` content with: fonts on `<html className={fontVariables}>`, `suppressHydrationWarning`, `<Provider>`, a page showing a `Button colorPalette="brand"`, a `peach` button, `ColorModeButton`, each text style, an Arabic sample line (`<Text dir="rtl">ثيمات جمالية مجانية لهاتفك</Text>`). P02 deletes these two files.

## Acceptance checks

- [ ] `npm run dev`: brand buttons render with correct colours; colour mode toggles without flash; Fraunces headings, Readex Pro body, Arabic sample renders in El Messiri/Readex Pro.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- [ ] `npm ls` has no unmet peer dependencies; `npm run chakra:typegen` succeeds.
- [ ] Response headers include the CSP and security headers (`curl -I http://localhost:3000`).

## Finish

Summarise changed files and any deviations. Commit: `P00: bootstrap`.
