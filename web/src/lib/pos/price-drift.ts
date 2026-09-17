/**
 * Catalog price change rule (S5, D-MSG-30): a line keeps the price it was
 * added at. A later catalog change never changes an existing line; the UI
 * says "catalog price now X" when the two differ.
 *
 * Pure. No `server-only`: the counter and the Messages sheet both draw it.
 */

export type PriceDriftLine = {
  /**
   * The raw catalog price at the add (before a live phase). Null on a line
   * written before S5 or on a custom line.
   */
  catalogPriceCentsAtAdd?: number | null;
  /** The unit price the line was added at. Null on a line written before S5. */
  priceSnapshotCents: number | null | undefined;
  /** What the line is charging now. */
  unitCents: number;
};

export type PriceDrift =
  | { drifted: false; snapshotCents: number; catalogNowCents: number | null }
  | {
      drifted: true;
      snapshotCents: number;
      catalogNowCents: number;
      /** Positive when the catalog went up since the add. */
      deltaCents: number;
    };

/**
 * `catalogNowCents` is the catalog's current price for the line's offering
 * (variant when the line names one). Null when the catalog no longer has the
 * item; a missing catalog price is not a drift, it is a missing item.
 *
 * The reference is the catalog price the line was added against: a phase
 * that priced the line under the list price is not a catalog change. A line
 * with no catalog stamp falls back to its price snapshot, and a pre-S5 line
 * with neither is compared on `unitCents`: the price it charges is the only
 * record of the price it was added at.
 */
export function priceDrift(line: PriceDriftLine, catalogNowCents: number | null | undefined): PriceDrift {
  const snapshotCents = Math.trunc(
    finite(line.catalogPriceCentsAtAdd) ?? finite(line.priceSnapshotCents) ?? line.unitCents,
  );
  if (typeof catalogNowCents !== "number" || !Number.isFinite(catalogNowCents)) {
    return { drifted: false, snapshotCents, catalogNowCents: null };
  }
  const now = Math.trunc(catalogNowCents);
  if (now === snapshotCents) return { drifted: false, snapshotCents, catalogNowCents: now };
  return { drifted: true, snapshotCents, catalogNowCents: now, deltaCents: now - snapshotCents };
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
