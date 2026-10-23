import { defineTextStyles } from '@chakra-ui/react';

export const textStyles = defineTextStyles({
  'display.2xl': {
    value: {
      fontFamily: 'heading',
      fontSize: { base: '36px', md: '48px' },
      lineHeight: 1.05,
      fontWeight: 650,
      letterSpacing: '-0.02em',
      _rtl: { lineHeight: 1.155, letterSpacing: 0, textTransform: 'none', fontStyle: 'normal' },
    },
  },
  'display.xl': {
    value: {
      fontFamily: 'heading',
      fontSize: { base: '28px', md: '36px' },
      lineHeight: 1.1,
      fontWeight: 650,
      letterSpacing: '-0.02em',
      _rtl: { lineHeight: 1.21, letterSpacing: 0, textTransform: 'none', fontStyle: 'normal' },
    },
  },
  'display.lg': {
    value: {
      fontFamily: 'heading',
      fontSize: '28px',
      lineHeight: 1.15,
      fontWeight: 600,
      letterSpacing: '-0.02em',
      _rtl: { lineHeight: 1.265, letterSpacing: 0, textTransform: 'none', fontStyle: 'normal' },
    },
  },
  'heading.md': {
    value: {
      fontFamily: 'heading',
      fontSize: '20px',
      lineHeight: 1.3,
      fontWeight: 600,
      _rtl: { lineHeight: 1.43, letterSpacing: 0, textTransform: 'none', fontStyle: 'normal' },
    },
  },
  'heading.sm': {
    value: {
      fontFamily: 'heading',
      fontSize: '17px',
      lineHeight: 1.35,
      fontWeight: 600,
      _rtl: { lineHeight: 1.485, letterSpacing: 0, textTransform: 'none', fontStyle: 'normal' },
    },
  },
  'body.md': {
    value: {
      fontFamily: 'body',
      fontSize: '16px',
      lineHeight: 1.55,
      fontWeight: 400,
      _rtl: { lineHeight: 1.705, letterSpacing: 0, textTransform: 'none', fontStyle: 'normal' },
    },
  },
  'body.sm': {
    value: {
      fontFamily: 'body',
      fontSize: '14px',
      lineHeight: 1.5,
      fontWeight: 400,
      _rtl: { lineHeight: 1.65, letterSpacing: 0, textTransform: 'none', fontStyle: 'normal' },
    },
  },
  caption: {
    value: {
      fontFamily: 'body',
      fontSize: '12px',
      lineHeight: 1.4,
      fontWeight: 500,
      _rtl: { lineHeight: 1.54, letterSpacing: 0, textTransform: 'none', fontStyle: 'normal' },
    },
  },
});
