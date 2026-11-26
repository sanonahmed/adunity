"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One-shot transient message.
 *
 * The project has no toast library and no provider tree to mount one into, so
 * this is the smallest thing that works: a timer that owns a single string.
 * `show` restarts the countdown, so repeated taps replace the pill instead of
 * stacking several of them.
 */
export function useToast(duration = 2400) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const show = useCallback(
    (next: string) => {
      clear();
      setMessage(next);
      timer.current = setTimeout(() => {
        timer.current = null;
        setMessage(null);
      }, duration);
    },
    [clear, duration],
  );

  /* Unmounting mid-countdown must not leave a timer writing to dead state. */
  useEffect(() => clear, [clear]);

  return { message, show };
}

/**
 * Pill that floats above the tab bar.
 *
 * The live region stays mounted so assistive tech registers it before the text
 * ever changes; only the pill itself is conditional. `pointer-events-none`
 * keeps it from swallowing taps on the rows underneath.
 */
export function Toast({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-bottom)+5.75rem)] z-30 flex justify-center px-5"
    >
      {message ? (
        <p className="glass-strong rise max-w-full rounded-full px-4 py-2 text-[11.5px] font-medium text-foreground/90 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
