'use client';

import { Box, useMediaQuery } from '@chakra-ui/react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

interface HideOnScrollProps {
  children: ReactNode;
}

export function HideOnScroll({ children }: HideOnScrollProps): ReactElement {
  const headerRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [desktop] = useMediaQuery(['(min-width: 48rem)'], { fallback: [false] });
  const reducedMotion = useReducedMotion();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (current) => {
    const previous = scrollY.getPrevious() ?? 0;
    const headerHeight = headerRef.current?.offsetHeight ?? 0;
    setHidden(current > headerHeight && current > previous);
  });

  return (
    <Box
      as="header"
      ref={headerRef}
      position="sticky"
      top="0"
      zIndex="sticky"
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
      css={{
        '@media (prefers-reduced-motion: reduce), (min-width: 48rem)': {
          '& > div': { transform: 'none !important' },
        },
      }}
    >
      <motion.div
        initial={false}
        animate={{ y: hidden && !focusWithin && !desktop && !reducedMotion ? '-100%' : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.14, ease: [0.2, 0, 0, 1] }}
      >
        {children}
      </motion.div>
    </Box>
  );
}
