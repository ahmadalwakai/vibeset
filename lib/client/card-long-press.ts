export interface CardLongPress {
  start: (pointerId: number, x: number, y: number) => void;
  move: (pointerId: number, x: number, y: number) => boolean;
  release: (pointerId: number) => void;
  cancel: () => void;
  consumeClick: () => boolean;
  blocksContextMenu: () => boolean;
}

/** One touch gesture; scrolling/movement never changes the card's normal link behavior. */
export function createCardLongPress(open: () => void): CardLongPress {
  let active: { id: number; x: number; y: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;
  const cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    active = null;
  };
  return {
    start: (id, x, y): void => {
      cancel();
      suppressClick = false;
      active = { id, x, y };
      timer = setTimeout(() => {
        timer = undefined;
        if (!active) return;
        suppressClick = true;
        open();
      }, 500);
    },
    move: (id, x, y): boolean => {
      if (!active || active.id !== id) return active !== null;
      if (Math.hypot(x - active.x, y - active.y) > 8) cancel();
      return active !== null;
    },
    release: (id): void => {
      if (active?.id === id) cancel();
    },
    cancel,
    consumeClick: (): boolean => {
      const blocked = suppressClick;
      suppressClick = false;
      return blocked;
    },
    blocksContextMenu: (): boolean => active !== null || suppressClick,
  };
}
