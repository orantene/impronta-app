"use client";

/**
 * Opening a sale from the counter: the address of a sale, the draft command,
 * and the ONE draft a sheet may be waiting on.
 *
 * `usePendingDraft` is the D-133/D-134 fix. The Custom amount tile opens its
 * sheet and starts a draft underneath; "Add to sale" before that draft's push
 * has landed used to return on `!sale` and write nothing (D-133), and once it
 * did write, a refresh of the sale-less address painted the line away
 * (D-134). One promise is shared by the tile tap and the sheet's submit, so a
 * write while the draft is still starting waits for it; the promise clears
 * once the address carries a sale (this draft or a later one), and when a
 * start is refused so the next tap tries again.
 *
 * `pushAfterWrite` is the D-155 fix. A `router.push` issued in the same
 * microtask turn as a server action's result overlapped two router-state
 * promises in Next's App Router and threw React #310 on the counter (see the
 * function's comment).
 */

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { posCreateDraft } from "./actions";

export type SaleTarget = { readonly orderId: string; readonly version: number };

type DraftResult = Awaited<ReturnType<typeof posCreateDraft>>;

/**
 * Move the address AFTER the router has applied the write that just returned.
 *
 * THE DEFECT (D-155). A server action resolves the caller's promise BEFORE
 * the App Router has applied the action's own state (`serverActionReducer`
 * calls `resolve(actionResult)` and only then returns the next state), so a
 * `router.push` in the continuation of `await posAddLine(...)` reaches the
 * action queue while that action is still pending. A navigation discards a
 * pending action (`dispatchAction`: "navigations take priority"), whose
 * state promise is then never resolved, and the router's root component is
 * left holding two thenables of which the second settles first: React 19
 * throws `Rendered more hooks than during the previous render` (#310) from
 * the App Router's own `useMemo` (react#33556). On the counter that was a
 * tap on an option tile: the draft opened, the line landed, the address
 * gained `?order=`, and the sale panel went blank until a reload.
 *
 * One macrotask later the action's state has been applied (everything after
 * the response is microtasks: no network), so the push is a plain navigation
 * on a settled router. Every push that follows a write goes through here;
 * `pos-page-wire.static.test.ts` keeps it that way.
 */
export function pushAfterWrite(router: { push: (href: string) => void }, href: string): void {
  setTimeout(() => router.push(href), 0);
}

/** Open a draft. `navigate` pushes to it at once; a caller adding a first line pushes after the line lands. */
export function useStartSale(input: {
  readonly run: (kind: "sale", fn: () => Promise<DraftResult>, refresh: boolean) => Promise<DraftResult>;
  readonly resetForNewSale: () => void;
  readonly saleHref: (orderId: string | null) => string;
}) {
  const router = useRouter();
  const { run, resetForNewSale, saleHref } = input;
  return useCallback(
    async (navigate = true): Promise<SaleTarget | null> => {
      const result = await run("sale", () => posCreateDraft(), false);
      if (result.ok && "orderId" in result && typeof result.orderId === "string") {
        resetForNewSale();
        if (navigate) pushAfterWrite(router, saleHref(result.orderId));
        return { orderId: result.orderId, version: 1 };
      }
      return null;
    },
    [resetForNewSale, router, run, saleHref],
  );
}

export function useSaleHref(posPath: string, mode: string) {
  return useCallback(
    (orderId: string | null) =>
      orderId ? `${posPath}?mode=${mode}&order=${encodeURIComponent(orderId)}` : `${posPath}?mode=${mode}`,
    [mode, posPath],
  );
}

export function usePendingDraft(input: {
  readonly sale: SaleTarget | null;
  readonly startSale: () => Promise<SaleTarget | null>;
}): () => Promise<SaleTarget | null> {
  // Read in event handlers only (a tap, a submit), never during render.
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  }, [input]);
  const pending = useRef<Promise<SaleTarget | null> | null>(null);
  const saleOrderId = input.sale?.orderId ?? null;
  useEffect(() => {
    if (saleOrderId) pending.current = null;
  }, [saleOrderId]);
  return useCallback(async () => {
    const { sale, startSale } = latest.current;
    if (sale) return { orderId: sale.orderId, version: sale.version };
    // Starts and pushes at once, as the tile tap does; the sheet stays open
    // across the push, and a write before it lands goes to this draft.
    if (!pending.current) pending.current = startSale();
    const opened = await pending.current;
    if (!opened) pending.current = null;
    return opened;
  }, []);
}
