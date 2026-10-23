'use client';

import { Box, CloseButton, Drawer, Portal, Stack } from '@chakra-ui/react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import type { PanInfo } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { springs } from '@/design/motion';

export interface ResponsiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusEl?: () => HTMLElement | null;
  finalFocusEl?: () => HTMLElement | null;
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  initialFocusEl,
  finalFocusEl,
}: ResponsiveSheetProps): ReactElement {
  const t = useTranslations('common');
  const reducedMotion = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);

  function finishDrag(_event: PointerEvent, info: PanInfo): void {
    const height = panel.current?.getBoundingClientRect().height ?? 0;
    if ((height > 0 && info.offset.y > height * 0.3) || info.velocity.y > 500) {
      onOpenChange(false);
      return;
    }
    void animate(y, 0, reducedMotion ? { duration: 0 } : springs.sheet);
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={({ open: nextOpen }) => onOpenChange(nextOpen)}
      placement={{ base: 'bottom', md: 'end' }}
      initialFocusEl={initialFocusEl}
      finalFocusEl={finalFocusEl}
      onExitComplete={() => y.set(0)}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Drawer.Backdrop
          bg="overlay.scrim"
          _open={{ animationDuration: 'slow' }}
          _closed={{ animationDuration: 'moderate' }}
          _motionReduce={{ animationDuration: 'instant' }}
        />
        <Drawer.Positioner>
          <Box
            asChild
            w={{ base: 'full', md: 'md' }}
            h={{ base: 'auto', md: 'full' }}
            maxH={{ base: '90dvh', md: '100dvh' }}
          >
            <motion.div style={{ y }}>
              <Drawer.Content
                ref={panel}
                maxW="full"
                h={{ base: 'auto', md: 'full' }}
                maxH={{ base: '90dvh', md: '100dvh' }}
                roundedTop={{ base: 'sheet', md: 'none' }}
                shadow="float"
                bg="bg.panel"
                pb="env(safe-area-inset-bottom)"
                _open={{ animationDuration: 'slow' }}
                _closed={{ animationDuration: 'moderate' }}
                _motionReduce={{
                  _open: { animationName: 'fade-in', animationDuration: 'instant' },
                  _closed: { animationName: 'fade-out', animationDuration: 'instant' },
                }}
              >
                <Box
                  asChild
                  display={{ base: 'flex', md: 'none' }}
                  alignItems="center"
                  justifyContent="center"
                  h="11"
                  flexShrink="0"
                  cursor="grab"
                  touchAction="none"
                  aria-hidden
                >
                  <motion.div
                    onPanStart={() => y.stop()}
                    onPan={(_event, info) => {
                      if (!reducedMotion) y.set(Math.max(0, info.offset.y));
                    }}
                    onPanEnd={finishDrag}
                  >
                    <Box h="1" w="12" rounded="full" bg="border.emphasized" />
                  </motion.div>
                </Box>
                <Drawer.Header pe="14" pt={{ base: '2', md: '6' }}>
                  <Stack gap="2">
                    <Drawer.Title textStyle="heading.md">{title}</Drawer.Title>
                    {description ? (
                      <Drawer.Description textStyle="body.sm">{description}</Drawer.Description>
                    ) : null}
                  </Stack>
                </Drawer.Header>
                <Drawer.Body>{children}</Drawer.Body>
                {footer ? (
                  <Drawer.Footer borderTopWidth="hairline" borderColor="border" flexWrap="wrap">
                    {footer}
                  </Drawer.Footer>
                ) : null}
                <Drawer.CloseTrigger asChild>
                  <CloseButton size="lg" aria-label={t('close')} />
                </Drawer.CloseTrigger>
              </Drawer.Content>
            </motion.div>
          </Box>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
