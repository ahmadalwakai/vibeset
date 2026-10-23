# Vibeset — ابدأ من هنا · Start here

---

## بالعربي

**ما هذا المجلد؟** خطة تنفيذ كاملة لتطبيق **Vibeset** (ثيمات جمالية مجانية: خلفيات + أيقونات + تصاميم ويدجت، عربي وإنجليزي):

- `docs/` — المواصفات الكاملة (المنتج، المعمارية، قاعدة البيانات، الصلاحيات، التصميم، محرك المحتوى، طرق التثبيت على الهاتف، المرحلة الثانية، قوائم الجودة).
- `.github/copilot-instructions.md` + `.github/instructions/` — قواعد دائمة يقرأها Copilot تلقائياً في كل طلب.
- `.github/prompts/` — 18 مرحلة جاهزة تُشغَّل داخل Copilot Chat بكتابة `/p00-bootstrap` … `/p17-launch`، بالإضافة إلى `/review` (فحص الجودة) و `/new-feature` (لأي ميزة جديدة لاحقاً).

**لماذا الملفات بالإنجليزية؟** لأن Copilot يكتب كوداً أدق بتعليمات إنجليزية، وأسماء الكود إنجليزية أصلاً. واجهة التطبيق نفسها عربية وإنجليزية بالكامل مع دعم RTL.

**الخطوات:**

1. ثبّت Node 24 LTS و VS Code مع GitHub Copilot (وضع Agent).
2. جهّز الحسابات: GitHub، Vercel، Neon، Cloudflare (R2)، Google Cloud (تسجيل الدخول بجوجل)، Resend (البريد).
3. أنشئ المشروع بالأمر الموجود في القسم الإنجليزي أدناه (الخطوة 1).
4. انسخ **كل** محتويات هذا المجلد إلى جذر المشروع — بما فيها المجلد المخفي `.github` (الخطوة 2).
5. انسخ `.env.example` إلى `.env.local` واملأ القيم.
6. افتح Copilot Chat ← وضع Agent ← اكتب `/p00-bootstrap`. بعد كل مرحلة: `/review` ثم commit.
7. نفّذ المراحل بالترتيب، **كل مرحلة في محادثة جديدة**.

**قواعد ذهبية:**

- ملفات `docs/` هي المرجع. إذا تغيّر قرار، عدّل الملف أولاً ثم الكود.
- لا تقبل أي migration قبل قراءتها، ولا تستخدم `drizzle-kit push` أبداً.
- جرّب على آيفون وأندرويد حقيقيين في المراحل 8 و 9 و 10.
- الويدجت الحية على الشاشة الرئيسية **لا يمكن** عملها بتطبيق ويب — هذه المرحلة الثانية (تطبيق Expo) في `docs/07`.
- قبل الإطلاق: حوّل Neon إلى خطة Launch (الخطة المجانية توقف قاعدة البيانات عند انتهاء الرصيد).

---

## English

### What's inside

```
vibeset-workflow/
├─ START-HERE.md                     ← this file
├─ AGENTS.md                         ← pointer for any AI agent
├─ .env.example                      ← every environment variable, documented
├─ docs/
│  ├─ 00-product.md                  what we build, for whom, why it beats ThemePack
│  ├─ 01-architecture.md             stack, folders, rendering, caching, security, costs, decisions
│  ├─ 02-data-model.md               Drizzle schema, ThemeSpec, status state machine
│  ├─ 03-api-and-permissions.md      roles, actions, routes, DTOs, cache tags, rate limits
│  ├─ 04-design-system.md            tokens, typography, motion, layouts, RTL, a11y
│  ├─ 05-content-pipeline.md         45 palettes, 40 aesthetics, generator, QA, 125-app catalogue
│  ├─ 06-install-flows.md            iPhone/Android/desktop flows, device test matrix
│  ├─ 07-roadmap-phase2-native.md    Expo companion app with live widgets
│  └─ 08-quality-checklists.md       Definition of Done, regression, release
└─ .github/
   ├─ copilot-instructions.md        global rules (auto-applied)
   ├─ instructions/                  scoped rules: database, server, ui, render (auto-applied by path)
   └─ prompts/                       p00 … p17 phase prompts + review + new-feature
```

### Prerequisites

- Node.js 24 LTS (`nvm install 24`), npm 10+, Git, VS Code with GitHub Copilot (Agent mode).
- Accounts: GitHub, Vercel, Neon, Cloudflare (R2), Google Cloud (OAuth client), Resend.
- Neon: create project `vibeset` in an EU region (London or Frankfurt) and a `dev` branch. Use the same region for Vercel functions later.

### 1. Create the project

```bash
npx create-next-app@latest vibeset --typescript --eslint --app --no-src-dir --no-tailwind --import-alias "@/*" --use-npm
cd vibeset
```

Answer any remaining questions: Turbopack → **Yes**, React Compiler → **No**, linter → **ESLint**. If it generated an `AGENTS.md`, ours replaces it.

### 2. Copy this folder in (including hidden files)

macOS / Linux:

```bash
cp -R ~/Downloads/vibeset-workflow/. .
```

Windows (PowerShell):

```powershell
robocopy $HOME\Downloads\vibeset-workflow . /E
```

Check that `.github/prompts/` exists in the project (Finder hides dot-folders: press ⌘⇧. to show them).

### 3. Environment

```bash
cp .env.example .env.local
```

Fill at least the Neon URLs, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, and the three secrets (`openssl rand -hex 32`). The rest is filled when the phase that needs it starts (each prompt lists its prerequisites).

### 4. Run the phases

Open Copilot Chat → **Agent** mode → choose the strongest model available → type the prompt name.

| # | Prompt | Outcome | Estimate |
|---|---|---|---|
| P00 | `/p00-bootstrap` | Dependencies, Chakra design system, env validation, tooling | 0.5 day |
| P01 | `/p01-database` | Schema, migrations, Better Auth core, ThemeSpec | 1 day |
| P02 | `/p02-app-shell-i18n` | Localised RTL shell, header, bottom nav | 1 day |
| P03 | `/p03-auth-roles` | Sign-in, guards, server foundations, admin grant | 1 day |
| P04 | `/p04-render-engine` | Wallpaper/icon/widget/preview renderer (the core) | 3–4 days |
| P05 | `/p05-storage-publish` | R2 storage + safe publish pipeline | 1.5 days |
| P06 | `/p06-content-generator` | 400+ draft themes from 40 aesthetics | 2–3 days |
| P07 | `/p07-browse-api` | Home, Explore, aesthetic/collection/creator pages, API v1 | 2 days |
| P08 | `/p08-theme-detail` | Theme page, SEO, wallpaper download | 1.5 days |
| P09 | `/p09-icons-install` | Icon export for any app, iOS wizard, guides | 2–3 days |
| P10 | `/p10-studio` | Live remix Studio | 3 days |
| P11 | `/p11-user-features` | Favourites, collections, account, reports | 2 days |
| P12 | `/p12-creator` | Creator application, uploads, authoring | 2–3 days |
| P13 | `/p13-admin-core` | Dashboard, review deck, publish queue | 2–3 days |
| P14 | `/p14-admin-ops` | Generator UI, collections, tags, apps, users, settings | 2 days |
| P15 | `/p15-seo-pwa-perf` | SEO, PWA, performance, daily cron | 1.5 days |
| P16 | `/p16-testing-ci` | Coverage, e2e per role, CI, backups | 2 days |
| P17 | `/p17-launch` | Production setup, legal pages, content, release | 2 days + content |

≈ 7 weeks of focused work for one developer with Copilot.

### 5. Working rules with Copilot

- **One phase = one fresh chat.** Long chats drift.
- Let Copilot run commands, but read every migration and every terminal command before approving.
- After each phase: `/review` → fix blockers → do the manual checks it lists → `git commit -m "P0X: …"`.
- If Copilot contradicts a doc, stop it and point to the section. If the doc is wrong, fix the doc first.
- Beyond the phases, use `/new-feature` with a description.
- If `/p00-bootstrap` doesn't appear in the chat, make sure the files are in `.github/prompts/` and that prompt files are enabled in VS Code settings (`chat.promptFiles`).

### 6. Key decisions (details in `docs/01` §15)

Next.js **16** (not 14 — it's end-of-life since Oct 2025; your tyrerescue repo already runs 16) · Cache Components on · Better Auth (Auth.js is now maintained by the Better Auth team) · Drizzle stable · Cloudflare R2 (zero egress) · resvg + sharp · web-first, native widgets in Phase 2 · generic icons, no brand logos.
