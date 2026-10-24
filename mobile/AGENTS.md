# Vibeset native iPhone app

The owner's 24 October 2026 instruction prioritizes the real iPhone app now. Native implementation proceeds alongside remaining web/provider launch work; those pending gates still apply before a usable beta is distributed.

- Follow root security, strict TypeScript, boundary validation, public-content and evidence rules. `docs/07-roadmap-phase2-native.md` is the native implementation source of truth.
- This directory uses Expo SDK 58, React Native 0.88 and React 19.3 with an independent package/lockfile. Web Chakra/Next/DOM rules apply to the web directories, not native views. Do not use a WebView wrapper.
- Use actual public API data, canonical DTOs/schemas and pure renderer functions. No demo catalogue or fabricated backend successes. All API and stored values must be validated; show loading, empty, error/retry and offline states.
- Keep public runtime configuration only. Never import server auth/database/environment modules or package secrets into the app. No invented Apple identifiers, App Groups or seller identity; require explicit verified configuration for native generation/signing.
- Keep native copy in matching `messages/en.json` and `messages/ar.json`. Use logical layout/start/end, native accessibility labels and at least 44-point controls. Keep phone artwork LTR.
- Bundle the existing validated icon/logo and licensed fonts. Preserve icon-glyph exclusion and licences. Document each new dependency's native purpose.
- Widgets run separately with Expo UI SwiftUI; no React Native views, hooks, async/network access or browser renderer in widget layout functions.
- Run this directory's typecheck, lint, tests, Expo version check and iOS Metro export. iOS prebuild/Xcode compilation requires macOS; Windows JS export is not an iOS build, signing proof or TestFlight upload. Root web checks remain required after root/shared changes.
