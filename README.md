# Vibeset

P00 bootstrap: Next.js 16 with Cache Components, React 19.2, Chakra UI v3, English/Arabic design samples and strict tooling. Product features begin in later phases.

## Local development

Use Node 24 (`.nvmrc`), then run:

```sh
npm ci
npm run chakra:typegen
npm run dev
```

Open http://localhost:3000. The temporary verification page demonstrates the palettes, all text styles, Arabic typography, light/dark mode, motion and success toasts. P02 replaces it with the localized app shell.

The P00 page builds without external services. Before P01, copy `.env.example` to `.env.local` and supply the real Neon URLs, public site URL, Better Auth URL/secret, IP hash salt, cron secret and internal API secret. Credentials for Google, Resend and R2 remain optional until their phases. Server configuration is validated when its module is imported; missing values produce key-specific errors. No external service credentials are fabricated or checked into this repository.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm ls
```

Integration tests added in later phases must use `describe.skipIf(!process.env.TEST_DATABASE_URL)`. `SKIP_ENV_VALIDATION=1` is accepted only in CI lint/typecheck jobs; required values still cannot be read without validation. Vercel production always rejects `E2E_TEST_AUTH=1`.

See [START-HERE.md](START-HERE.md), [the architecture](docs/01-architecture.md) and [the ordered phase prompts](.github/prompts/).

Chakra's generated color-mode snippet requires `react-icons`; it is retained as a snippet dependency. Product UI icons use Phosphor.

The Emotion streaming registry uses `@emotion/cache` to keep Chakra CSS and Cache Components hydration consistent. A scoped esbuild override patches Drizzle Kit's legacy development loader; `drizzle-kit --version` verifies CLI startup.

P00 verification passed: 36 environment boundary tests, TypeScript, ESLint, production build, Chakra type generation, complete dependency tree and a zero-vulnerability npm audit. Browser checks covered 360px, 768px and 1440px layouts, light/dark persistence, Arabic/RTL typography, reduced-motion cold loads, both button toasts, hydration and keyboard skip navigation.

Manual spot-check: run `npm run dev`, open the page on a phone, toggle colour mode, try both buttons and check the Arabic sample. With a keyboard, Tab reveals the skip link; Enter moves focus to the main content. Real iPhone/Android installation flows begin in later phases.
