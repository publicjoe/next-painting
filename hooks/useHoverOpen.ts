import { useEffect, useRef } from 'react';

export const HOVER_OPEN_MS = 500;

interface Options {
  overId: string | null;
  isOpenable: (id: string) => boolean;
  onOpen: (id: string) => void;
  delayMs?: number;
}

/**
 * Calls `onOpen(overId)` once the pointer has rested on an openable target for
 * `delayMs`. Changing `overId` restarts the clock; unmounting cancels it.
 * The timer lives in an effect with a cleanup, so Strict Mode's double effect
 * leaves exactly one live timer. The callbacks are read through a ref so a new
 * function identity on each render does not restart the clock.
 */
export function useHoverOpen({ overId, isOpenable, onOpen, delayMs = HOVER_OPEN_MS }: Options): void {
  const latest = useRef({ isOpenable, onOpen });
  useEffect(() => { latest.current = { isOpenable, onOpen }; });

  useEffect(() => {
    if (overId === null) return;
    const timer = setTimeout(() => {
      if (latest.current.isOpenable(overId)) latest.current.onOpen(overId);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [overId, delayMs]);
}
