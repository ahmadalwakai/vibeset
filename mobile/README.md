# Vibeset for iPhone

تطبيق iPhone أصلي باستخدام React Native، مع شاشات عربية وإنجليزية وودجت WidgetKit وإبلاغ وحظر محلي منفّذة في المصدر. يعمل إصلاح بناء Mac وإعداد الخدمات بالتوازي. لا يعني وجود هذا المشروع أن نسخة TestFlight رُفعت.

## Implemented source

- Native Explore/search/sort/cursor browsing and published theme details through the existing public `/api/v1` contracts. No embedded web app or sample catalogue.
- Device-local favourites, language and appearance in strictly validated versioned storage. Failed reads cannot overwrite an unread record; explicit recovery reads it first.
- In-app report submission without sign-in through `POST /api/v1/reports`, using the existing canonical schema, abuse limits and moderator queue. Theme hiding and creator blocking filter content locally, persist across relaunch and clear a matching selected widget; Settings manages blocked creators. Failed or cancelled reports do not claim success.
- Actual published **phone home-wallpaper JPEG** saving to Photos with add-only permission, or the native share sheet. Lock previews are labelled previews rather than full-resolution lock downloads. Downloads are cancellable/bounded, use the configured CDN only and clean up owned temporary files.
- Native Settings, support/privacy links and EN/AR copy, logical layout, accessible controls and the existing branded icon.
- Small/medium themed calendar/time widgets. Expo UI supplies isolated SwiftUI layouts; a config plugin checks the generated source before replacing only the calendar provider with a WidgetKit provider that derives fresh local dates and requests its own next-day refresh. OS refresh delivery remains discretionary. App resume also requests a reload.
- No native account creation, synced favourites, Studio or icon-pack exporter is claimed in this first slice. Those need further native implementation; browser canvas code is not a native exporter. The app does not send automatic view statistics or embed server/storage credentials.

## Local checks

This package has its own lockfile, React 19.3 and React Native 0.88, separate from web React 19.2. Use Node 24.3+.

```sh
cd mobile
npm ci --prefix ..
npm ci
npm run typecheck
npm run lint
npm test
npm run check:expo
npm run export:ios -- --max-workers 2
```

Metro export produces an iOS JavaScript/Hermes bundle plus assets. It is **not** an Xcode compilation, installable IPA, widget-placement proof or TestFlight upload. Windows cannot run this Expo CLI's iOS prebuild. Expo Go cannot verify the native widget extension. Use a real macOS-generated development/distribution app and an iPhone.

On 24 October 2026, TypeScript, ESLint, all **157 tests in eight files**, the Expo dependency compatibility check and a fresh iOS Hermes export passed (1,030 modules, 3.2 MB, four assets). The eighth test file executes the actual Expo widget runtime and registry bundlers and validates the serialized layout. Root web typecheck/lint and **2,357 tests in 187 files** also passed after the report API/privacy integration (zero skips; test duration 260.79 seconds), followed by a successful 222-path production web build. All non-limiter tables in the isolated test database were confirmed empty after cleanup. An isolated fixture-only configuration probe loaded the app/widget plugins in their required order without generating iOS or registering Apple identifiers. These checks do not establish native/device behavior.

Install both lockfiles on a fresh checkout: the canonical shared schemas/types under root `lib/` resolve their validation and type-only dependencies from root `node_modules`. Metro explicitly resolves native React/React Native/Zod from the mobile package, keeping the web React runtime out of the app.

Public runtime origins are `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CDN_URL`. Put only native configuration in ignored `mobile/.env.local`, using `.env.example`; never copy the web server's `.env.local` into this app. With no API configuration, the UI shows a retryable service error instead of fabricated content. Production needs reachable HTTPS origins, actual published assets and monitored privacy/support pages.

## Native generation and Codemagic

The Apple app record now exists (Apple ID `6826572844`, SKU `vibeset-ios-001`, English U.K. plus Arabic), and both registered app/extension identifiers have their shared App Group assigned. Configure those verified identifiers using the variable names in `.env.example`; never invent replacements. `npm run check:native` loads only the native `.env.local` (or CI-injected variables), validates complete identifiers and HTTPS origins without printing values. Both `npm run prebuild:ios` and `npm run ios` run that guard first.

The manual `ios-native-unsigned` workflow uses Mac mini M2, Xcode 27.1 and Node 24. Configure the `vibeset_native` Codemagic group with those public identifiers/origins. It installs both lockfiles, checks the native package, generates iOS, installs Pods and compiles the app/extension with `CODE_SIGNING_ALLOWED=NO`. Its unsigned `.app` archive cannot be installed through TestFlight. Artifact paths remain relative to the repository root. The generated extension target is **ExpoWidgetsTarget**; its configured bundle ID is separate from the main app.

The separate manual `ios-native-simulator` workflow explicitly sets `VIBESET_NATIVE_GENERATE=compile` and the intended public app/extension/App Group identifiers in YAML, with no service environment group or invented API/CDN defaults. `npm run check:native:compile` requires complete valid identifiers, permits **both service origins to be omitted together**, and otherwise validates both as strict HTTPS origins. Partial, empty or malformed values fail. This check establishes syntax only: it does not verify Apple registration/association, provisioning or provider reachability. With origins omitted, the actual app displays its retryable configuration error instead of catalogue content.

`npm run prebuild:ios:compile` runs that explicit guard and launches Expo with compile mode limited to the child process. Normal `check:native`, `prebuild:ios`, `ios` and `VIBESET_NATIVE_GENERATE=1` retain the strict beta requirements for both service origins; setting compile mode does not weaken the ordinary `check:native` command. Never use compile-only artifacts for TestFlight or treat their diagnostic error UI as a store screenshot.

The simulator workflow builds an unsigned ARM64 **Release simulator** app and widget extension, checks that the app contains its JavaScript bundle and extension, and archives `mobile/build/vibeset-simulator-ios-app.zip`. Release embeds the JavaScript, so the simulator does not need Metro. A physical-device `Debug-iphoneos` artifact from the other workflow cannot run in Simulator. [Codemagic simulator builds](https://docs.codemagic.io/yaml-code-signing/ios-simulator-builds/), [Expo simulator builds](https://docs.expo.dev/build-reference/simulators/).

After compilation, it creates its own iPhone 17 Pro / iOS 27.0 simulator from the pinned Xcode 27.1 image, waits for boot, selects light appearance and a fixed status-bar time, then installs and launches the actual app with `simctl`. It captures `launch.png` immediately and `launch-after-25s.png` after a bounded diagnostic interval, then removes only its simulator. PNGs and `capture.json` are artifacts under `mobile/build/simulator-diagnostics/`; the Xcode log is also retained. These captures may show launch, loading or genuine service-error UI until real API/CDN services are reachable. They do **not** assert UI readiness, catalogue content, widget placement, Photos/share behavior or App Store screenshot suitability. Settings and other screen captures require native UI interaction/automation; `simctl` launch alone does not navigate the app. [Codemagic simulator execution](https://docs.codemagic.io/yaml-testing/testing/).

Simulator compilation and screenshots require no Apple signing certificate or paid-team access. This repository still requires its actual configured app/extension/App Group identifiers before generation; simulator jobs do not register them or prove their provisioning. Neither simulator `.app` archives nor their screenshots are an IPA or TestFlight upload.

**Actual simulator attempts:** build 1 failed on architecture configuration, corrected in `a859314`. Build 2 passed checks, macOS prebuild and Pods, then failed during ExpoWidgets bundling with exit 65. Its exact error, `Unable to resolve ../../lib/render/spec from widgets/model.ts`, also reproduced locally. The fix isolates empty initial props from runtime validators/root imports, retains only a type import of the model at registration and uses named relative JSON imports instead of stubbed interop helpers. Both real Expo bundlers and the serialized layout pass locally; the macOS rerun is pending. This does not verify Swift/provider compilation. No completed `.app`, IPA, simulator screenshots, installed extension or real-device result is yet established; the configured capture steps above have not produced verification evidence.

**Apple/Codemagic state:** English and Arabic listing/beta descriptions and private review contacts are saved; revised report/hide/block copy in the handoff still needs syncing. Sign-in is not required, public release is manual, and **Vibeset Internal** contains one owner and zero builds with automatic distribution off. The approved App Manager team key **VibesetCodemagic** is created and connected through Codemagic Developer Portal. The proposed `VibesetDistribution` certificate and matching profiles await operator approval; no creation is verified. Workflow signing/profiles and a signed TestFlight upload workflow are not configured; no IPA or upload is verified. Do not record key IDs, issuer IDs, key material or private contacts here. Public HTTPS support/privacy URLs and submitted age/privacy declarations remain missing.

After actual macOS compile verification: confirm applicable agreements, final native privacy manifests and encryption answers; configure matching app/extension signing profiles and add a TestFlight-only archive/upload workflow with increasing build numbers. Apple processing, tester assignment and an actual device installation are separate checks.

## Assets and dependencies

The existing opaque 1024px brand icon is `assets/app-icon.png`; the original vector mark is included beside it. Three native UI families (Readex Pro, Fraunces, El Messiri) and their OFL notices are copied from the existing repository sources. Widget fonts currently use system designs; exact custom extension-font parity remains future work.

Expo/React Native provide native views/runtime. `expo-font` loads local licensed fonts; `expo-linear-gradient` renders the brand; `expo-localization` declares supported locales; `expo-splash-screen` and `expo-status-bar` handle native launch/chrome; `react-native-safe-area-context` respects device insets; AsyncStorage stores validated local preferences; Zod reuses canonical boundaries; `expo-file-system`, `expo-media-library` and `expo-sharing` implement native files/Photos/share; `expo-widgets` and `@expo/ui` implement WidgetKit layouts/storage. TypeScript/ESLint/Vitest/tsx provide checks and build configuration loading. Each is native infrastructure rather than a replacement for the web stack.

The Expo CLI's transitive Zod is overridden to patched 4.6.7. A separate upstream `node-forge<=1.4.0` signature-verification advisory has **no published patched version** at implementation time: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). The mobile audit reports four high-severity dependency findings inherited from this one advisory through Expo's certificate tooling. No zero-vulnerability claim is made and no blind force downgrade is applied. Review the supported upstream fix and actual workflow exposure before distribution.

## Required verification

macOS Swift/Pod compilation, signing/entitlements, real API/CDN/Photos/share, VoiceOver/EN/AR/RTL, widget initial installation, midnight/time-zone/DST refresh and long offline behavior remain device/build checks. Contract tests and a Hermes export cannot establish those results. Legal text and actual native data/permissions need qualified review before release. See [the beta handoff](../docs/09-testflight-handoff.md).

The bilingual public Terms/Privacy source now covers native local favourites, hidden themes, blocked public creator handles/names, App Group selection/timelines and requested Photos/share behaviour. Public API/CDN requests expose search/filter/theme IDs and request metadata. Explicit reports send the theme ID, reason and optional details; anonymous reports retain a salted IP hash in the moderator queue. No account sync or automatic event tracking is implemented, but this is **not** a “no data collected” declaration. Verify deployed reporting and human moderation, final provider retention, live HTTPS policy/support pages and Apple privacy/age/export answers before distribution.
