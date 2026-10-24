# Vibeset — Install Flows (getting a theme onto a real phone)

This is where users succeed or give up. Every flow below must be tested on a real iPhone (latest + previous iOS) and a real Android phone before release.

---

## 1. Platform detection (`lib/client/platform.ts`)

```ts
isIOS()            // /iPad|iPhone|iPod/ or (platform === 'MacIntel' && maxTouchPoints > 1)
isAndroid()
isInAppBrowser()   // UA contains Instagram | FBAN | FBAV | TikTok | musical_ly | Snapchat | Pinterest | LinkedInApp
isStandalone()     // matchMedia('(display-mode: standalone)') or navigator.standalone
canShareFiles(files: File[])  // !!navigator.canShare?.({ files })
```

**In-app browsers** (most traffic from TikTok/Instagram lands here) often block downloads and file sharing. When `isInAppBrowser()`: show a sticky banner "For downloads, open in Safari/Chrome" with a copy-link button and a short illustrated "⋯ → Open in browser" instruction. Recorded menu media is a P17 content task; until it exists, use the instruction and Phosphor illustration without referencing missing GIF assets. Never let the user hit a silent failure.

## 2. Sharing & downloading files (`lib/client/share.ts`)

- iOS Safari requires `navigator.share({ files })` to run **inside the user's tap**. Any slow `await` before it (fetch, render) can expire the activation → `NotAllowedError`.
  → Two-step UX: **Prepare** (fetch/render, shows progress) → **Save to Photos** button that calls `share` immediately.
- `AbortError` (user closed the sheet) → ignore silently. `NotAllowedError` → toast "Tap Save again". Other errors → fallback download.
- Batches: iOS saves at most `IOS_SHARE_BATCH = 20` files per share (constant; verify on device and tune).
- Fallback (desktop, Android without file sharing): `URL.createObjectURL(blob)` → `<a download>` → revoke after 2 s (Safari needs the delay).
- Many files on Android/desktop → ZIP with `fflate` (`zip` async API, level 0 for PNG/JPEG — they're already compressed).
- File names: `vibeset-{slug}-{size}-{w}x{h}.jpg`, `vibeset-{slug}-{appSlug}.png`, `vibeset-{slug}-icons.zip`.

---

## 3. iPhone / iPad

### 3.1 Wallpaper

1. Theme page → **Download** → size sheet (Phone preselected on phones; Tablet on iPad; 4K and "My screen" render on device for generated wallpapers). Studio uses the current edited spec for every export: phone/tablet/desktop render locally, including photo focal point/dimming; 4K/My screen remain generated-only. Export sources carry optional published IDs, so local Studio exports do not increment another theme's download/icon totals. Successful saves/downloads from a source theme claim one `remix` event per editor session.
2. Opening the sheet prefetches the selected file as a blob.
3. **Save to Photos** → share sheet → "Save Image".
4. Inline guide: Photos → open the image → Share → **Use as Wallpaper** → adjust → Add → choose "Set as Wallpaper Pair" or "Customize Home Screen".

### 3.2 App icons (the main event)

1. **Get icons** → app picker: default = first 24 sorted by rank then slug; search includes names and Arabic aliases; category chips; **+ Custom icon** (label + any glyph from the manifest). Persist validated `{ v: 1, appSlugs, custom }` in `localStorage` at `vibeset:selected-apps`; retain intentional empty choices, reconcile stale IDs and use a current-document memory fallback when storage is blocked. Limits are 125 catalogue apps plus 20 custom icons; optional four decor outputs bring the export cap to 149 files and 64 MiB. Custom filename IDs are `custom-{UUID}` and never derive from labels.
2. **Generate** → renderer + required glyph weight JSON load on demand → icons render in chunks of 6. Await `scheduler.yield()` when supported, otherwise await a timer between chunks. Show progress "12 / 24" and cancel with AbortController. iOS icons are opaque, full-bleed 512 × 512 PNG.
3. **Save to Photos** in batches ("Save 1–20", "Save 21–24"), each a separate tap.
4. **Set them up** → `/setup/ios?theme={slug}` wizard.

### 3.3 Setup wizard (`/setup/ios`)

Chakra `Steps` for the one-time intro, then a per-app checklist. Progress saved in `localStorage` (`vibeset:ios-wizard:{slug || 'default'}` → `{ v: 1, done: string[], completed: boolean }`), so users can leave and come back. Reconcile IDs with the current catalogue/custom selection. The completion flag prevents duplicate setup tracking across reloads or unchecking/rechecking; an explicit reset starts a new setup. When storage is blocked, keep validated progress in memory for the current document so navigating away and back preserves the checklist and completion claim.

For each selected app (card with the app's new icon):

1. **Open Shortcuts** button → `shortcuts://create-shortcut` (fallback text: "Open the Shortcuts app and tap +").
2. Tap **Add Action** → search **Open App** → tap it → tap **App** → choose *{App}*.
3. Open the shortcut's **Details** controls → **Add to Home Screen**. Control placement can vary by iOS version.
4. Tap the small icon → **Choose Photo** → pick the *{App}* icon you saved.
5. Rename to *{App}* → **Add**.
6. Tap **Done ✓** in Vibeset → next app.

Finish screen: hide the original icons (long-press → Remove App → **Remove from Home Screen**; the app stays in the App Library), plus the wallpaper reminder.

The Shortcuts URL, Open App action and custom Home Screen icon flow follow Apple's [URL scheme](https://support.apple.com/en-euro/guide/shortcuts/apda283236d7/ios), [creation guide](https://support.apple.com/guide/shortcuts/create-a-custom-shortcut-apd84c576f8c/ios) and [Home Screen instructions](https://support.apple.com/en-euro/guide/shortcuts/apd735880972/9.0/ios/26). The readable Home Screen guide is versioned iOS26; verify current device labels before release instead of promising exact control positions.

Each step has a 3–6 s silent looping MP4 (our own screen recordings, < 600 KB, `playsInline muted loop`) stored in R2. Step labels in Shortcuts change between iOS versions: re-verify text and recordings at every major iOS release (checklist in `docs/08`).

FAQ section: "Why does a banner appear when I open an app?" → iOS behaviour when launching through Shortcuts; we can't change it. "Can Vibeset do this automatically?" → No app can; iOS doesn't allow it.

Track `setup_complete` once when every selected app is ticked.

### 3.4 Decor widgets (optional)

Export static decor images (`glyphBadge`, `ring`, `stickerCollage`, `photoFrame`) → save to Photos → add them with a compatible photo widget. Widget setup varies by device; do not promise current album-selection controls until verified on that device. Copy must be honest: "static decorative widgets — live widgets are coming in the Vibeset app".

---

## 4. Android

- **Wallpaper**: share sheet (`navigator.share` with a file works in Chrome) or direct download → Gallery → Set as wallpaper (or long-press home screen → Wallpaper & style).
- **Icons**: generate shaped transparent PNGs (respecting `icons.shape`) → **Download ZIP** (primary) or **Share images**. Guide: Android's own launcher usually can't change icons; use a launcher that supports per-app custom icons or a shortcut-maker app (same idea as iOS Shortcuts). Keep the guide generic and screenshot-based; don't promise a specific third-party app.
- A native Android icon-pack + widgets app is Phase 2.

## 5. Desktop

- Wallpaper sizes: desktop 2560 × 1440 (pre-rendered), 4K, and "My screen" (`screen.width × devicePixelRatio`, capped at 16.7M pixels) rendered on device.
- macOS: System Settings → Wallpaper → Add Photo. Windows: right-click the image → Set as desktop background.
- Icons are offered as a ZIP (useful for Android users who browse on desktop).

---

## 6. Approaches evaluated and rejected

| Approach | Why rejected |
|---|---|
| iOS configuration profile with many Web Clips ("install all icons at once") | Tapping a non-web URL web clip opens Safari first, then the app; unsigned profiles show "Unverified"; install goes through Settings + passcode (scary for teens); opening a specific app by bundle id is an MDM feature. Revisit only after a real-device spike proves a clean UX |
| Generating `.shortcut` files to automate | Shortcuts cannot add Home Screen icons programmatically; user still does the same steps |
| PWA home-screen widgets | Not supported on iOS or Android web |

---

## 7. Analytics events (`POST /api/track`)

| Event | When |
|---|---|
| `view` | theme page viewed (once per session per theme — `sessionStorage` guard) |
| `download` | a wallpaper file was saved/downloaded (after successful share/download, not on click) |
| `icon_export` | an icon batch was saved or ZIP downloaded (once per export) |
| `remix` | Studio opened from a theme (`?from=`) and the user downloaded or saved |
| `setup_complete` | iOS wizard finished for a theme |

Sent with `fetch('/api/track', { method: 'POST', keepalive: true, credentials: 'omit' })` (fire-and-forget). No personal data or cookies are sent. `sendBeacon` is deliberately not used because the [Beacon specification](https://www.w3.org/TR/beacon/) requires credentials to be included. The endpoint never reads authentication cookies or creates analytics cookies.

---

## 8. Test matrix (manual, before every release)

| Device | Browser | Must pass |
|---|---|---|
| iPhone (latest iOS) | Safari | wallpaper save, 24-icon export in 2 batches, wizard progress persistence, Studio 4K/“My screen” render |
| iPhone (previous iOS) | Safari | same |
| iPhone | Instagram + TikTok in-app browser | "Open in browser" banner shows; no silent failures |
| iPad | Safari | tablet sizes, layout |
| Android (Pixel-class) | Chrome | wallpaper share/download, ZIP export |
| Android (Samsung) | Samsung Internet | same |
| Desktop | Chrome, Safari, Firefox | desktop/4K downloads, ZIP |
