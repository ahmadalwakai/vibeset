'use client';

import { Box } from '@chakra-ui/react';
import { useEffect, useMemo, useRef } from 'react';
import type { PointerEvent, ReactElement, ReactNode } from 'react';
import { createCardLongPress } from '@/lib/client/card-long-press';
import { ThemeMenuActions, useThemeMenuActions } from './ThemeMenuActions';

function cardLink(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('a[href]') &&
    !target.closest(
      'button,input,textarea,select,[role="button"],[role="menuitem"],[contenteditable="true"]',
    )
  );
}

function InteractionSurface({
  themeId,
  children,
}: {
  themeId: string;
  children: ReactNode;
}): ReactElement {
  const { openCollection } = useThemeMenuActions();
  const gesture = useMemo(
    () => createCardLongPress(() => openCollection(themeId)),
    [openCollection, themeId],
  );
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      gesture.cancel();
      cleanup.current?.();
    },
    [gesture],
  );

  function start(event: PointerEvent<HTMLDivElement>): void {
    gesture.cancel();
    cleanup.current?.();
    cleanup.current = null;
    // A new pointer interaction cannot inherit a previous long press's click suppression.
    gesture.consumeClick();
    if (
      event.pointerType !== 'touch' ||
      !event.isPrimary ||
      event.button !== 0 ||
      !cardLink(event.target)
    )
      return;
    gesture.start(event.pointerId, event.clientX, event.clientY);
    const stop = (): void => {
      gesture.cancel();
      cleanup.current?.();
      cleanup.current = null;
    };
    const move = (value: globalThis.PointerEvent): void => {
      if (!gesture.move(value.pointerId, value.clientX, value.clientY)) stop();
    };
    const end = (value: globalThis.PointerEvent): void => {
      if (value.pointerId !== event.pointerId) return;
      gesture.release(value.pointerId);
      stop();
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', end, { passive: true });
    window.addEventListener('pointercancel', end, { passive: true });
    window.addEventListener('scroll', stop, { capture: true, passive: true });
    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('scroll', stop, { capture: true });
    };
  }

  return (
    <Box
      display="contents"
      css={{ '@media (pointer: coarse)': { WebkitTouchCallout: 'none', userSelect: 'none' } }}
      onPointerDownCapture={start}
      onClickCapture={(event) => {
        if (event.detail > 0 && cardLink(event.target) && gesture.consumeClick()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onContextMenuCapture={(event) => {
        if (cardLink(event.target) && gesture.blocksContextMenu()) event.preventDefault();
      }}
    >
      {children}
    </Box>
  );
}

export function ThemeCardInteraction({
  themeId,
  children,
}: {
  themeId: string;
  children: ReactNode;
}): ReactElement {
  return (
    <ThemeMenuActions>
      <InteractionSurface themeId={themeId}>{children}</InteractionSurface>
    </ThemeMenuActions>
  );
}
