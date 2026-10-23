# Vibeset brand assets

These assets reuse the custom four-point sparkle and orchid-to-peach gradient from
`app/icon.svg`, following `docs/04-design-system.md` §1. The existing web favicon is unchanged.

- `app-icon.svg`: full-bleed square vector master, without baked-in rounded corners.
- `app-icon-1024.png`: opaque 1024 × 1024 RGB PNG with an embedded sRGB profile, prepared for
  native icon tooling. Let the target platform apply its own icon mask.
- `logo-mark.svg`: the same white sparkle on a transparent canvas; place it on a dark or
  brand-coloured background. This is the symbol only, not a wordmark export.

Regenerate the PNG from the project root with the already-installed Sharp dependency:

```sh
node --input-type=module -e "import sharp from 'sharp'; await sharp('public/brand/app-icon.svg').resize(1024, 1024).toColourspace('srgb').removeAlpha().withIccProfile('srgb').png({ compressionLevel: 9 }).toFile('public/brand/app-icon-1024.png');"
```

These are native-preparation assets. They are not wired into an Xcode/Expo project and do not
indicate a signed iOS build or TestFlight upload.
