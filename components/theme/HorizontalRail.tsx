'use client';

import { Box, HStack, Icon, IconButton } from '@chakra-ui/react';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Children, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface HorizontalRailProps {
  children: ReactNode;
  label: string;
}

export function HorizontalRail({ children, label }: HorizontalRailProps): ReactElement {
  const t = useTranslations('theme.rail');
  const rail = useRef<HTMLDivElement>(null);
  const id = useId();
  const reduced = useReducedMotion();
  const items = Children.toArray(children);
  const [edges, setEdges] = useState({ start: true, end: items.length <= 1 });

  useEffect(() => {
    const node = rail.current;
    const first = node?.firstElementChild;
    const last = node?.lastElementChild;
    if (!node || !first || !last || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        setEdges((previous) => {
          let { start, end } = previous;
          for (const entry of entries) {
            if (entry.target === first) start = entry.intersectionRatio >= 0.99;
            if (entry.target === last) end = entry.intersectionRatio >= 0.99;
          }
          return start === previous.start && end === previous.end ? previous : { start, end };
        });
      },
      { root: node, threshold: [0, 0.99, 1] },
    );
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, [children]);

  function move(direction: -1 | 1): void {
    const node = rail.current;
    if (!node) return;
    const bounds = node.getBoundingClientRect();
    const elements = Array.from(node.children);
    const current = Math.max(
      0,
      elements.findIndex((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
      }),
    );
    const firstWidth = elements[0]?.getBoundingClientRect().width ?? node.clientWidth;
    const step = Math.max(1, Math.floor(node.clientWidth / firstWidth));
    elements[
      Math.max(0, Math.min(elements.length - 1, current + direction * step))
    ]?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
  }

  return (
    <Box minW="0">
      <HStack justify="end" gap="2" mb="3" display={{ base: 'none', md: 'flex' }}>
        <IconButton
          aria-label={t('previous', { label })}
          aria-controls={id}
          variant="outline"
          rounded="full"
          size="lg"
          disabled={edges.start}
          onClick={() => move(-1)}
        >
          <Icon asChild boxSize="5" _rtl={{ transform: 'scaleX(-1)' }}>
            <ArrowLeftIcon aria-hidden />
          </Icon>
        </IconButton>
        <IconButton
          aria-label={t('next', { label })}
          aria-controls={id}
          variant="outline"
          rounded="full"
          size="lg"
          disabled={edges.end}
          onClick={() => move(1)}
        >
          <Icon asChild boxSize="5" _rtl={{ transform: 'scaleX(-1)' }}>
            <ArrowRightIcon aria-hidden />
          </Icon>
        </IconButton>
      </HStack>
      <Box
        ref={rail}
        id={id}
        role="region"
        aria-label={label}
        tabIndex={0}
        display="flex"
        gap={{ base: '3', md: '5' }}
        overflowX="auto"
        scrollSnapType="x mandatory"
        pb="5"
        px="1"
        pt="1"
        focusRing="inside"
        rounded="input"
        css={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
      >
        {items.map((child, index) => (
          <Box
            key={isValidElement(child) ? child.key : index}
            flexShrink="0"
            w={{ base: '40', sm: '44', md: '48', lg: '52' }}
            scrollSnapAlign="start"
          >
            {child}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
