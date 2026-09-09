/**
 * POS check — a partition of `orders`, not a competing commercial record.
 */

export type CheckSplitLine = {
  orderLineId: string;
  units: number;
  totalCents: number;
};

export type CheckPartition = {
  checkId: string;
  lines: readonly CheckSplitLine[];
  totalCents: number;
};

/** Deterministic rounding across splits: largest remainder, stable by line id. */
export function splitCheckEvenly(
  lines: readonly CheckSplitLine[],
  parts: number,
): CheckPartition[] | { ok: false; error: string } {
  if (!Number.isInteger(parts) || parts < 2) {
    return { ok: false, error: "Split needs at least two checks." };
  }
  const sorted = [...lines].sort((a, b) => a.orderLineId.localeCompare(b.orderLineId));
  const partitions: CheckPartition[] = Array.from({ length: parts }, (_, i) => ({
    checkId: `check_${i + 1}`,
    lines: [],
    totalCents: 0,
  }));
  for (const line of sorted) {
    const base = Math.floor(line.totalCents / parts);
    let remainder = line.totalCents - base * parts;
    for (let i = 0; i < parts; i += 1) {
      const share = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      if (share <= 0) continue;
      partitions[i]!.lines = [
        ...partitions[i]!.lines,
        { orderLineId: line.orderLineId, units: line.units, totalCents: share },
      ];
      partitions[i]!.totalCents += share;
    }
  }
  const sum = partitions.reduce((s, p) => s + p.totalCents, 0);
  const expected = lines.reduce((s, l) => s + l.totalCents, 0);
  if (sum !== expected) {
    return { ok: false, error: "Split totals do not conserve money." };
  }
  return partitions;
}
