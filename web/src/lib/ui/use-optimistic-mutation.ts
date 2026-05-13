"use client";

import { useCallback, useRef, useState } from "react";

/**
 * G.1 — Optimistic mutation hook for low-stakes UI actions.
 *
 * Applies a UI change immediately (pin, mark-read, reorder, toggle) and
 * dispatches a server action in the background. If the server reports
 * failure, the local state rolls back automatically.
 *
 * Pattern:
 *   const { value, run, pending, error } = useOptimisticMutation({
 *     initial: false,
 *     mutate: async (next) => togglePinAction(id, next),
 *   });
 *   <button onClick={() => run(!value)}>Pin</button>
 *
 * The mutate function:
 *   - receives the desired NEXT value
 *   - returns either { ok: true } or { ok: false; error? }
 *   - throwing is treated as failure too (caught + rolled back)
 *
 * Idempotency: if the user clicks twice quickly, only the latest mutation
 * persists. Stale responses are dropped via a generation counter.
 */
export type OptimisticMutationResult = { ok: true } | { ok: false; error?: string };

export type UseOptimisticMutationOptions<T> = {
  /** Starting value. */
  initial: T;
  /** Server-side action that effects the change. */
  mutate: (next: T) => Promise<OptimisticMutationResult>;
  /** Optional callback fired after a successful mutation. */
  onSuccess?: (next: T) => void;
  /** Optional callback fired after a rollback. */
  onError?: (error: string | undefined, attempted: T, restored: T) => void;
};

export type UseOptimisticMutationReturn<T> = {
  value: T;
  /** Apply next value optimistically and run the mutation. */
  run: (next: T) => void;
  /** True while a mutation is in flight. */
  pending: boolean;
  /** Last error message (cleared on next run). */
  error: string | null;
};

export function useOptimisticMutation<T>(
  options: UseOptimisticMutationOptions<T>,
): UseOptimisticMutationReturn<T> {
  const { initial, mutate, onSuccess, onError } = options;
  const [value, setValue] = useState<T>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the latest mutation generation so stale callbacks don't clobber
  // fresher state.
  const genRef = useRef(0);
  // Track the canonical (server-committed) value so rollbacks restore the
  // last-known-good state, not a stale local optimistic guess.
  const committedRef = useRef<T>(initial);

  const run = useCallback(
    (next: T) => {
      const myGen = ++genRef.current;
      setError(null);
      setPending(true);
      setValue(next);

      (async () => {
        try {
          const result = await mutate(next);
          if (myGen !== genRef.current) return; // a fresher mutation superseded us
          if (result.ok) {
            committedRef.current = next;
            setPending(false);
            onSuccess?.(next);
          } else {
            const msg = result.error ?? "Action failed";
            setValue(committedRef.current);
            setError(msg);
            setPending(false);
            onError?.(msg, next, committedRef.current);
          }
        } catch (err) {
          if (myGen !== genRef.current) return;
          const msg = err instanceof Error ? err.message : "Action failed";
          setValue(committedRef.current);
          setError(msg);
          setPending(false);
          onError?.(msg, next, committedRef.current);
        }
      })();
    },
    [mutate, onSuccess, onError],
  );

  return { value, run, pending, error };
}
