# Vibeset — Phase 2: Native Companion App (live widgets)

Phase 1 (web) cannot put live widgets on a home screen — no web app can. Phase 2 adds a small native app that turns any Vibeset theme into real widgets. It reuses everything Phase 1 builds: `/api/v1`, `ThemeSpec` tokens, the renderer, the content.

**Delivery priority — updated by the owner on 24 October 2026:** build the real native iPhone app now, alongside remaining web/provider launch work. Reuse the implemented public API, theme data and brand assets. Do not postpone native implementation for the web JavaScript budget, public-launch content count or adoption milestones. Reachable real services, native functionality, signing, privacy and device verification remain prerequisites to distributing a usable TestFlight beta. A web archive or Metro JavaScript export is not an iOS build or upload.

---

## 1. Shape

- **Expo (React Native, TypeScript)** in `mobile/` inside the same repo, with its own package/config and a dedicated Codemagic iOS build/sign/upload workflow with independent native verification. Keep the existing web workflow intact; choose one signing authority rather than independently managing the same identifiers through Codemagic and EAS.
- Screens: Home (featured + trending from `/api/v1/themes`), Theme detail, My widgets, Icon exporter (same flow as web, native share sheet), Settings.
- Auth (optional, for synced favourites): Better Auth's Expo integration against the same server — verify the current package/plugin name in Better Auth docs at that time.

## 2. Widgets

| Platform | Approach                                                                                               | Notes                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | **`expo-widgets`** — widgets written in TypeScript with Expo UI SwiftUI components and a config plugin | Verify required families/timelines on a real device; fallback: a Swift WidgetKit target via config plugin                                 |
| Android  | Evaluate SDK 58 `expo-widgets` with Expo UI Jetpack Compose first                                      | Android is opt-in with a smaller supported component/feature set; compare a native Glance module or maintained alternative only if needed |

**Status checked 24 October 2026:** the [SDK 55 reference](https://docs.expo.dev/versions/v55.0.0/sdk/widgets/) labels widgets alpha; the [SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/sdk/widgets/) no longer carries that warning and recommends `expo-widgets ~58.0.23`. It supports Android and iOS, requires a development build rather than Expo Go, and runs widget code separately without React hooks, app state or asynchronous work. This is a documentation-status update, not a claim of proven Vibeset compatibility or production stability; recheck the selected SDK patch before implementation.

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

**Native safety addition:** `POST /api/v1/reports` is a private/no-store mutation, not a CDN-cached catalogue read. It reuses the website's optional-session/ban checks, reports feature flag, five-per-hour user-or-salted-IP limit and transactional report service. The native detail screen offers explicit anonymous reporting, local theme hiding and local creator blocking; Settings can reverse those local choices. Current preferences filter cached and late catalogue/detail results too. Blocking clears an applied widget when its recorded theme/creator matches; older widget summaries without a creator reference support exact-theme clearing only. Reports leave the device; hidden themes and blocked creators remain local. Keep reporting available while creator content is served, monitor the queue and archive offending content when appropriate. Review the actual initial catalogue against the chosen age rating; the app does not yet provide age-gated catalogue filtering. These controls and the published-design retention/removal policy are described in the bilingual legal copy.

## 5. Store risks & mitigations

| Risk                                                                                                             | Mitigation                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| App Store 4.3 (spam / saturated category) and 4.2 (minimum functionality) — common rejections for wallpaper apps | Lead with live widgets + Studio, original generated content, no copycat metadata or screenshots |
| Privacy review                                                                                                   | No tracking, no ads SDKs, minimal data; same privacy policy as web                              |
| Trademark                                                                                                        | Same rules: generic glyphs, no brand logos                                                      |
| Tips/donations                                                                                                   | Digital tips inside iOS apps must use In-App Purchase                                           |

## 6. Effort estimate (solo developer with Copilot)

| Work                                      | Estimate    |
| ----------------------------------------- | ----------- |
| Expo app shell, API client, browse/detail | 1–1.5 weeks |
| iOS widgets (4–6 types)                   | 1.5–2 weeks |
| Android widgets                           | 1.5–2 weeks |
| Icon exporter (native share)              | 0.5 week    |
| Store assets, review cycles               | 1 week      |

## 7. First TestFlight readiness — 24 October 2026

**Implement and test the native iPhone app now through a dedicated Codemagic workflow.** This supersedes the earlier web-first implementation order; pending provider and native distribution gates remain explicit. Native Expo source in `mobile/` includes real catalogue/detail screens, local favourites, Photos/share adapters, bilingual settings, reporting/local content controls and a calendar/time widget with a native-refresh provider plugin. Native typecheck, lint, 157 tests, Expo compatibility and the iOS Metro/Hermes export pass locally. The regression suite also runs both actual Expo widget bundle scripts and evaluates the serialized small/medium layouts. A real Codemagic Mac runner successfully generated the Xcode app/extension and installed Pods; compilation then failed because the isolated widget registry could not resolve an app-only schema import. The dependency-free initial-props fix passes both local widget bundlers and awaits the next Mac result. No completed native app, signed IPA or TestFlight upload is established by those checks.

Browser verification confirmed active individual Apple Developer membership and created Vibeset's App Store Connect record **6826572844**, main ID `com.ahmadalwakai.vibeset`, widget ID `com.ahmadalwakai.vibeset.calendar` and App Group `group.com.ahmadalwakai.vibeset`; both identifiers are assigned the group. English/Arabic listing and beta metadata are saved, with manual public release and no sign-in requirement. The internal `Vibeset Internal` group has the approved owner email and zero builds, with automatic distribution disabled. The owner-approved App Manager API key is connected to Codemagic; distribution certificates/profiles remain separate signing setup. Registration and integration do not establish signed entitlements, a native build or a usable TestFlight invitation. The existing `web-production` Codemagic archive is a web server artifact.

Reuse `public/brand/app-icon-1024.png`, `app-icon.svg`, `logo-mark.svg`, the licensed fonts and generic glyph assets in the eventual native catalogue. Approved public operator/contact metadata is **Ahmad Alwakai — ahmadalwakai@gmx.com** (`lib/legal.ts`). It does not establish Apple membership, legal seller identity, mailbox verification or ownership of a `gmx` Bundle ID namespace.

The current [Expo SDK 58 release](https://expo.dev/changelog/sdk-58) is dated 15 October 2026 and targets iOS 27/React Native 0.88 with React 19.3. The initial package selects Expo 58.0.19 and React Native 0.88.0 separately from the web app’s React version. Apple currently requires uploads built with **Xcode 26 or later and iOS/iPadOS 26 SDK or later**; that is an upload floor, not the selected Expo toolchain or deployment target. Codemagic lists an [Xcode 27.1 image](https://docs.codemagic.io/specs-macos/xcode-27-1/) for M2/M4. Pin and validate a compatible released SDK/Xcode pair when native implementation starts; do not copy web dependency versions or select an edge image blindly. [Apple requirements](https://developer.apple.com/news/upcoming-requirements/).

Before the first beta:

1. **Reachable service:** verify stable HTTPS API/CDN origins, published content, provider-backed auth/storage and monitored privacy/support URLs. The native app receives public runtime configuration, never database credentials, R2 signing keys or internal secrets. Reuse `/api/v1` additively; browser DOM/canvas export helpers need native file/render/share adapters.
2. **Team and identifiers:** confirm the intended paid Apple Developer team, agreements, roles and any existing app before creating anything. Choose an owner-controlled main Bundle ID, widget-extension ID and shared App Group only after that check. Configure matching entitlements and app-store distribution profiles for both targets. Create the App Store Connect record with the chosen main ID, language, SKU and access scope before upload; record its numeric app ID and increment build numbers. [Apple app records](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/).
3. **Codemagic signing:** configure a dedicated App Store Connect integration/API key with the required App Manager permission, keeping Issuer ID, Key ID, `.p8` and certificate/private-key material in secure provider storage, never Git/chat. Add a separate native workflow using `distribution_type: app_store`, exact identifiers and all extension profiles; keep `submit_to_app_store: false` for beta-only delivery. Prove an unsigned native build before signing/archive/upload. [Codemagic signing](https://docs.codemagic.io/yaml-quick-start/building-a-react-native-app/), [publishing requirements](https://docs.codemagic.io/yaml-publishing/app-store-connect/).
4. **Native privacy and device checks:** review actual dependencies, required-reason APIs/privacy manifests, encryption/export answers and native permission descriptions. Request only needed photo access; location remains optional with a manual alternative. Preserve privacy defaults and account deletion/reporting where those features are offered. Test EN/AR/RTL, accessibility, offline/errors, native save/share, widget App Group persistence and timeline updates on a real iPhone; web tests do not establish native correctness. [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/).
5. **Beta outcome:** upload, wait for Apple processing/compliance, assign an internal tester group and verify an actual installation. Internal testers are eligible App Store Connect users; external invitations require beta metadata and first-build Beta App Review. Builds expire after 90 days. Upload, processing, review approval and successful installation are separate milestones; no Apple acceptance/date is guaranteed. [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

The native implementation and its commands are documented in `mobile/README.md`. It does not register Apple identifiers, confirm accounts or submit a build. The separate `ios-native-unsigned` Codemagic workflow compiles an unsigned app/extension on macOS only after verified identifiers and public origins are supplied; it performs no signing or publishing.

**Compile-only simulator exception:** `ios-native-simulator` explicitly uses `VIBESET_NATIVE_GENERATE=compile` and the intended public identifiers, without a provider environment group or service defaults. `assertNativeCompileEnvironment` still requires complete, structurally valid app/extension/App Group identifiers. It accepts both public origins being absent together; if either is provided, both must pass the strict HTTPS-origin rules. Empty, partial or malformed values fail. This enables real macOS/Swift compilation and labelled simulator launch diagnostics while services are being configured; the app shows its actual retryable configuration error when origins are absent. It proves no Apple registration/association, signing, service reachability, populated screenshot, widget placement or TestFlight readiness. Ordinary `check:native`, `prebuild:ios`, `ios` and mode `1` retain the strict beta guard. The compile-only prebuild script sets mode only for its Expo child process; this exception is never a beta/signing fallback.
