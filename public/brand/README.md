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

P15 also exports the same full-bleed master to `public/icons/icon-192.png`,
`public/icons/icon-512.png`, `public/icons/maskable-512.png`, `app/icon.png` (512px) and
`app/apple-icon.png` (180px). The sparkle fits the maskable icon's central safe circle;
all PNGs are opaque and carry an sRGB profile. The manifest uses these assets for web
installation, while iOS applies its own icon mask.

`npm run brand:build` deterministically regenerates those five icons plus the English and
Arabic 1200 × 630 social cards in `public/og/`. It uses the existing SVG master, licensed
local fonts, translated copy, resvg and Sharp. Arabic marks explicitly retain RTL punctuation
when rendered to paths. No external image service or system fonts are involved.
