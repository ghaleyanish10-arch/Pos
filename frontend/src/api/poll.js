import { useEffect, useRef } from 'react';

/**
 * Poll `fn` on a fixed cadence without hammering a sick API:
 *  - no work while the tab is hidden,
 *  - on consecutive failures the delay doubles (up to 8x the base) so a dead
 *    backend isn't hit every few seconds,
 *  - back to the base cadence as soon as a call succeeds.
 * `fn` should rethrow after handling its own UI state so the backoff sees it.
 */
export function useBackoffInterval(fn, baseMs) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timerRef = useRef(null);
  const failRef = useRef(0);

  useEffect(() => {
    let off = false;
    const tick = async () => {
      if (off) return;
      if (!document.hidden) {
        try {
          await fnRef.current();
          failRef.current = 0;
        } catch {
          failRef.current = Math.min(failRef.current + 1, 4);
        }
      }
      timerRef.current = setTimeout(tick, baseMs * Math.max(1, 2 ** (failRef.current - 1)));
    };
    tick();
    return () => {
      off = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [baseMs]);
}