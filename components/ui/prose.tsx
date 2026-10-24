'use client';

import { chakra } from '@chakra-ui/react';
import type { SystemStyleObject } from '@chakra-ui/react';

const proseSelectors: SystemStyleObject = {
  '& :where(p):not(.not-prose, .not-prose *)': {
    marginTop: '1em',
    marginBottom: '1em',
  },
  '& :where(blockquote):not(.not-prose, .not-prose *)': {
    marginTop: '1.285em',
    marginBottom: '1.285em',
    paddingInline: '1.285em',
    borderInlineStartWidth: '0.25em',
    color: 'fg',
  },
  '& :where(a):not(.not-prose, .not-prose *)': {
    color: 'fg',
    textDecoration: 'underline',
    textUnderlineOffset: '0.2em',
    textDecorationThickness: 'from-font',
    textDecorationColor: 'currentColor',
    fontWeight: '500',
    _focusVisible: { outline: 'auto' },
  },
  '& :where(strong):not(.not-prose, .not-prose *)': {
    fontWeight: '600',
  },
  '& :where(a strong):not(.not-prose, .not-prose *)': {
    color: 'inherit',
  },
  '& :where(em):not(.not-prose, .not-prose *)': {
    fontStyle: 'italic',
  },
  '& :where(h1):not(.not-prose, .not-prose *)': {
    fontSize: '2.15em',
    letterSpacing: '-0.02em',
    marginTop: '0',
    marginBottom: '0.8em',
    lineHeight: '1.2em',
    _rtl: { lineHeight: '1.32em' },
  },
  '& :where(h2):not(.not-prose, .not-prose *)': {
    fontSize: '1.65em',
    letterSpacing: '-0.02em',
    marginTop: '1.6em',
    marginBottom: '0.8em',
    lineHeight: '1.3em',
    _rtl: { lineHeight: '1.43em' },
  },
  '& :where(h3):not(.not-prose, .not-prose *)': {
    fontSize: '1.35em',
    letterSpacing: '-0.01em',
    marginTop: '1.5em',
    marginBottom: '0.4em',
    lineHeight: '1.4em',
    _rtl: { lineHeight: '1.54em' },
  },
  '& :where(h4):not(.not-prose, .not-prose *)': {
    marginTop: '1.4em',
    marginBottom: '0.5em',
    letterSpacing: '-0.01em',
    lineHeight: '1.5em',
    _rtl: { lineHeight: '1.65em' },
  },
  '& :where(img):not(.not-prose, .not-prose *)': {
    marginTop: '1.7em',
    marginBottom: '1.7em',
    borderRadius: 'lg',
    boxShadow: 'inset',
  },
  '& :where(picture):not(.not-prose, .not-prose *)': {
    marginTop: '1.7em',
    marginBottom: '1.7em',
  },
  '& :where(picture > img):not(.not-prose, .not-prose *)': {
    marginTop: '0',
    marginBottom: '0',
  },
  '& :where(video):not(.not-prose, .not-prose *)': {
    marginTop: '1.7em',
    marginBottom: '1.7em',
  },
  '& :where(kbd):not(.not-prose, .not-prose *)': {
    fontSize: '0.85em',
    borderRadius: 'xs',
    paddingTop: '0.15em',
    paddingBottom: '0.15em',
    paddingInlineEnd: '0.35em',
    paddingInlineStart: '0.35em',
    fontFamily: 'inherit',
    color: 'fg.muted',
    boxShadow: 'inset',
  },
  '& :where(code):not(.not-prose, .not-prose *)': {
    fontSize: '0.925em',
    bg: 'bg.muted',
    letterSpacing: '-0.01em',
    lineHeight: '1',
    _rtl: { lineHeight: '1.1' },
    borderRadius: 'md',
    borderWidth: 'hairline',
    paddingInline: '0.25em',
  },
  '& :where(pre code):not(.not-prose, .not-prose *)': {
    fontSize: 'inherit',
    letterSpacing: 'inherit',
    borderWidth: 'inherit',
    padding: '0',
    bg: 'transparent',
  },
  '& :where(h2 code):not(.not-prose, .not-prose *)': {
    fontSize: '0.9em',
  },
  '& :where(h3 code):not(.not-prose, .not-prose *)': {
    fontSize: '0.8em',
  },
  '& :where(pre):not(.not-prose, .not-prose *)': {
    backgroundColor: 'bg.muted',
    marginTop: '1.6em',
    marginBottom: '1.6em',
    borderRadius: 'md',
    fontSize: '0.9em',
    paddingTop: '0.65em',
    paddingBottom: '0.65em',
    paddingInlineEnd: '1em',
    paddingInlineStart: '1em',
    overflowX: 'auto',
    fontWeight: '400',
  },
  '& :where(ol):not(.not-prose, .not-prose *)': {
    marginTop: '1em',
    marginBottom: '1em',
    paddingInlineStart: '1.5em',
  },
  '& :where(ul):not(.not-prose, .not-prose *)': {
    marginTop: '1em',
    marginBottom: '1em',
    paddingInlineStart: '1.5em',
  },
  '& :where(li):not(.not-prose, .not-prose *)': {
    marginTop: '0.285em',
    marginBottom: '0.285em',
  },
  '& :where(ol > li):not(.not-prose, .not-prose *)': {
    paddingInlineStart: '0.4em',
    listStyleType: 'decimal',
    '&::marker': {
      color: 'fg.muted',
    },
  },
  '& :where(ul > li):not(.not-prose, .not-prose *)': {
    paddingInlineStart: '0.4em',
    listStyleType: 'disc',
    '&::marker': {
      color: 'fg.muted',
    },
  },
  '& :where(> ul > li p):not(.not-prose, .not-prose *)': {
    marginTop: '0.5em',
    marginBottom: '0.5em',
  },
  '& :where(> ol > li p):not(.not-prose, .not-prose *)': {
    marginTop: '0.5em',
    marginBottom: '0.5em',
  },
  '& :where(> ul > li > p):not(.not-prose, .not-prose *):first-of-type': {
    marginTop: '0em',
  },
  '& :where(> ul > li > p):not(.not-prose, .not-prose *):last-of-type': {
    marginBottom: '0em',
  },
  '& :where(> ol > li > p):not(.not-prose, .not-prose *):first-of-type': {
    marginTop: '0em',
  },
  '& :where(> ol > li > p):not(.not-prose, .not-prose *):last-of-type': {
    marginBottom: '0em',
  },
  '& :where(ul ul, ul ol, ol ul, ol ol):not(.not-prose, .not-prose *)': {
    marginTop: '0.5em',
    marginBottom: '0.5em',
  },
  '& :where(dl):not(.not-prose, .not-prose *)': {
    marginTop: '1em',
    marginBottom: '1em',
  },
  '& :where(dt):not(.not-prose, .not-prose *)': {
    fontWeight: '600',
    marginTop: '1em',
  },
  '& :where(dd):not(.not-prose, .not-prose *)': {
    marginTop: '0.285em',
    paddingInlineStart: '1.5em',
  },
  '& :where(hr):not(.not-prose, .not-prose *)': {
    marginTop: '2.25em',
    marginBottom: '2.25em',
  },
  '& :where(:is(h1,h2,h3,h4,h5,hr) + *):not(.not-prose, .not-prose *)': {
    marginTop: '0',
  },
  '& :where(table):not(.not-prose, .not-prose *)': {
    width: '100%',
    tableLayout: 'auto',
    textAlign: 'start',
    lineHeight: '1.5em',
    marginTop: '2em',
    marginBottom: '2em',
  },
  '& :where(thead):not(.not-prose, .not-prose *)': {
    borderBottomWidth: 'hairline',
    color: 'fg',
  },
  '& :where(tbody tr):not(.not-prose, .not-prose *)': {
    borderBottomWidth: 'hairline',
    borderBottomColor: 'border',
  },
  '& :where(thead th):not(.not-prose, .not-prose *)': {
    paddingInlineEnd: '1em',
    paddingBottom: '0.65em',
    paddingInlineStart: '1em',
    fontWeight: 'medium',
    textAlign: 'start',
  },
  '& :where(thead th):not(.not-prose, .not-prose *):first-of-type': {
    paddingInlineStart: '0',
  },
  '& :where(thead th):not(.not-prose, .not-prose *):last-of-type': {
    paddingInlineEnd: '0',
  },
  '& :where(tbody td, tfoot td):not(.not-prose, .not-prose *)': {
    paddingTop: '0.65em',
    paddingInlineEnd: '1em',
    paddingBottom: '0.65em',
    paddingInlineStart: '1em',
  },
  '& :where(tbody td:first-of-type, tfoot td):not(.not-prose, .not-prose *):first-of-type': {
    paddingInlineStart: '0',
  },
  '& :where(tbody td:last-of-type, tfoot td):not(.not-prose, .not-prose *):last-of-type': {
    paddingInlineEnd: '0',
  },
  '& :where(figure):not(.not-prose, .not-prose *)': {
    marginTop: '1.625em',
    marginBottom: '1.625em',
  },
  '& :where(figure > *):not(.not-prose, .not-prose *)': {
    marginTop: '0',
    marginBottom: '0',
  },
  '& :where(figcaption):not(.not-prose, .not-prose *)': {
    fontSize: '0.85em',
    lineHeight: '1.25em',
    marginTop: '0.85em',
    color: 'fg.muted',
  },
  '& :where(h1, h2, h3, h4, h5, h6):not(.not-prose, .not-prose *)': {
    color: 'fg',
    fontWeight: '600',
  },
  '& :where(h1, h2, h3, h4, h5, h6, code):not(.not-prose, .not-prose *)': {
    _rtl: { letterSpacing: '0', fontStyle: 'normal', textTransform: 'none' },
  },
  '& :where(em, i):not(.not-prose, .not-prose *)': {
    _rtl: { fontStyle: 'normal' },
  },
};

export const Prose = chakra('div', {
  base: {
    color: 'fg.muted',
    maxWidth: '65ch',
    fontSize: 'sm',
    lineHeight: '1.7em',
    _rtl: { lineHeight: '1.87em', letterSpacing: '0', fontStyle: 'normal', textTransform: 'none' },
    ...proseSelectors,
  },
  variants: {
    size: {
      md: {
        fontSize: 'sm',
      },
      lg: {
        fontSize: 'md',
      },
    },
  },
  defaultVariants: {
    size: 'md',
  },
});
