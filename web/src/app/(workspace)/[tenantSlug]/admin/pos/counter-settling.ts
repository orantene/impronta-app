"use client";

/**
 * useWriteHold — the counter's hold between an accepted write and the
 * re-read that shows it (D-156), in its own file because `pos-client.tsx`
 * runs no effects (`pos-page-wire.static.test.ts`) and the ceiling needs one.
 *
 * The rule is in `counter-model.ts` (`writeHoldSettling`): the hold is the
 * sale object the write was made against, released by the next re-read
 * whatever version it carries. This hook adds the ceiling: a hold older
 * than `WRITE_HOLD_MS` releases on its own and asks the router for one more
 * re-read, so a refresh that never delivered cannot leave "Cobrar" reading
 * "Cobrando" until a reload.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { WRITE_HOLD_MS, writeHoldSettling } from "./counter-model";

export function useWriteHold<T extends object>(current: T | null, timeoutMs: number = WRITE_HOLD_MS): {
  readonly settling: boolean;
  /** Hold the till against the sale a write was just accepted on. */
  readonly hold: (written: T) => void;
} {
  const router = useRouter();
  const [held, setHeld] = useState<T | null>(null);
  const settling = writeHoldSettling(held, current);

  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => {
      setHeld(null);
      router.refresh();
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [router, settling, timeoutMs]);

  const hold = useCallback((written: T) => setHeld(written), []);
  return { settling, hold };
}
