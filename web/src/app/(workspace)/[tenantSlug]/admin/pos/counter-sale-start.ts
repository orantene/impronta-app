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
 */

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { posCreateDraft } from "./actions";

export type SaleTarget = { readonly orderId: string; readonly version: number };

type DraftResult = Awaited<ReturnType<typeof posCreateDraft>>;

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
        if (navigate) router.push(saleHref(result.orderId));
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
