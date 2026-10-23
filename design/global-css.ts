import { defineGlobalStyles } from '@chakra-ui/react';

export const globalCss = defineGlobalStyles({
  ':root': {
    '--font-body': 'var(--font-readex)',
    '--font-display': 'var(--font-fraunces)',
  },
  html: {
    // Chakra's preflight supplies WebKit antialiasing and macOS grayscale smoothing.
    WebkitTapHighlightColor: 'transparent',
  },
  body: {
    bg: 'bg',
    color: 'fg',
    fontFamily: 'body',
    textStyle: 'body.md',
  },
  '::selection': {
    bg: 'brand.muted',
  },
  'html[dir="rtl"] body': {
    lineHeight: 1.705,
    fontStyle: 'normal',
    textTransform: 'none',
  },
  'html[dir="rtl"] :is(h1, h2, h3, h4, h5, h6)': {
    letterSpacing: 0,
    textTransform: 'none',
    fontStyle: 'normal',
  },
});
