# Vibeset — Phase 2: Native Companion App (live widgets)

Phase 1 (web) cannot put live widgets on a home screen — no web app can. Phase 2 adds a small native app that turns any Vibeset theme into real widgets. It reuses everything Phase 1 builds: `/api/v1`, `ThemeSpec` tokens, the renderer, the content.

**Decision gate** — start Phase 2 when the web app shows real pull: ≥ 10k monthly visitors and ≥ 25% activation (download/icon export). Before that, widgets are a cost without proven demand.

---

## 1. Shape

- **Expo (React Native, TypeScript)** in `mobile/` inside the same repo — the same pattern as tyrerescue's `driver-app/` and `admin-app/` (EAS builds, `eas.json`).
- Screens: Home (featured + trending from `/api/v1/themes`), Theme detail, My widgets, Icon exporter (same flow as web, native share sheet), Settings.
- Auth (optional, for synced favourites): Better Auth's Expo integration against the same server — verify the current package/plugin name in Better Auth docs at that time.

## 2. Widgets

| Platform | Approach | Notes |
|---|---|---|
| iOS | **`expo-widgets`** — widgets written in TypeScript with `@expo/ui` SwiftUI components, config plugin, supports system and lock-screen families | Launched as alpha; check its status on the current Expo SDK. Fallback: a Swift WidgetKit target added via config plugin |
| Android | Evaluate `react-native-android-widget` (JS-described widgets) vs a Jetpack Glance module via config plugin | Pick the one with active maintenance at that time |

Widget catalogue v1: digital clock, analog clock, date + month calendar, countdown, photo (user picks a photo in the app), bilingual quote, weather (Open-Meteo, no API key, location optional). All styled only from theme tokens.

## 3. Data flow

```
App fetches theme → extracts tokens { palette, widgets, type, decor } →
writes JSON to shared storage (iOS App Group / Android SharedPreferences) →
widgets read tokens + render natively (works offline, no server calls from widgets)
```

- Token contract = `ThemeSpec` v1 (`docs/02` §5). Unknown future fields are ignored by the widget code.
- Fonts: bundle the same OFL fonts in the app.
- Decor glyphs: ship the glyph subset as SVG path data (same JSON as `public/glyphs/v1`).

## 4. API requirements (already satisfied by Phase 1)

- `/api/v1/themes`, `/api/v1/themes/[slug]` (includes `spec`), `/api/v1/collections`, `/api/v1/apps`, `/api/v1/tags`.
- **Additive changes only**. Breaking change ⇒ `/api/v2`.
- CORS is not needed for native apps; keep `/api/v1` public and CDN-cached.

## 5. Store risks & mitigations

| Risk | Mitigation |
|---|---|
| App Store 4.3 (spam / saturated category) and 4.2 (minimum functionality) — common rejections for wallpaper apps | Lead with live widgets + Studio, original generated content, no copycat metadata or screenshots |
| Privacy review | No tracking, no ads SDKs, minimal data; same privacy policy as web |
| Trademark | Same rules: generic glyphs, no brand logos |
| Tips/donations | Digital tips inside iOS apps must use In-App Purchase |

## 6. Effort estimate (solo developer with Copilot)

| Work | Estimate |
|---|---|
| Expo app shell, API client, browse/detail | 1–1.5 weeks |
| iOS widgets (4–6 types) | 1.5–2 weeks |
| Android widgets | 1.5–2 weeks |
| Icon exporter (native share) | 0.5 week |
| Store assets, review cycles | 1 week |
