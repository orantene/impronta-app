/** Who put a line on the draft (S5, D-MSG-30). */
export type LineAuthor = "client" | "staff" | "system";

export type DraftLine = {
  id: string;
  offeringId?: string | null;
  label: string;
  units: number;
  unitCents: number;
  /** Who proposed the line. Absent on a snapshot taken before S5. */
  proposedBy?: LineAuthor | null;
  confirmedAt?: string | null;
};

/** One recorded change to a line's price, from `order_line_events`. */
export type PriceChange = {
  at: string;
  by: LineAuthor;
  fromCents: number | null;
  toCents: number;
};

export type DraftSnapshot = {
  version: number;
  currency: string;
  lines: readonly DraftLine[];
  note?: string | null;
};

export type DraftDiffLine = {
  lineId: string;
  field: "label" | "units" | "unitCents" | "added" | "removed" | "note" | "currency";
  previous: string | number | null;
  theirs: string | number | null;
  yours: string | number | null;
  /** Who proposed the line the row is about. Null for the whole-draft rows (note, currency). */
  proposedBy: LineAuthor | null;
  /** Who made the latest recorded change to the line. Null until `annotateDiffWithEvents` runs or when nothing is recorded. */
  changedBy: LineAuthor | null;
  /** Every recorded unit-price change on the line, oldest first. Empty until annotated. */
  priceHistory: PriceChange[];
};

/** A row of `order_line_events`, as the sheet reads it. */
export type LineEventRow = {
  line_id: string;
  actor_kind: string;
  created_at: string;
  change: { op?: string; old?: { unit_cents?: number | string | null } | null; new?: { unit_cents?: number | string | null } | null } | null;
};

/**
 * Hands each diff row who last touched its line and the line's price history,
 * read from `order_line_events`. Pure: the sheet reader passes the rows in.
 */
export function annotateDiffWithEvents(diff: readonly DraftDiffLine[], events: readonly LineEventRow[]): DraftDiffLine[] {
  const byLine = new Map<string, LineEventRow[]>();
  for (const event of events) {
    const list = byLine.get(event.line_id) ?? [];
    list.push(event);
    byLine.set(event.line_id, list);
  }
  for (const list of byLine.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return diff.map((row) => {
    const list = byLine.get(row.lineId);
    if (!list || list.length === 0) return row;
    const priceHistory: PriceChange[] = [];
    for (const event of list) {
      const from = cents(event.change?.old?.unit_cents);
      const to = cents(event.change?.new?.unit_cents);
      if (to == null || from === to) continue;
      priceHistory.push({ at: event.created_at, by: author(event.actor_kind), fromCents: from, toCents: to });
    }
    return { ...row, changedBy: author(list[list.length - 1].actor_kind), priceHistory };
  });
}

function author(value: unknown): LineAuthor {
  return value === "client" || value === "system" ? value : "staff";
}

function cents(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Three-way diff for a concurrent draft edit (MS18 / P12).
 * `base` is the version the screen loaded. `theirs` is on the server now.
 * `yours` is the stale save.
 */
export function diffDraft(base: DraftSnapshot, theirs: DraftSnapshot, yours: DraftSnapshot): DraftDiffLine[] {
  const out: DraftDiffLine[] = [];
  if (theirs.currency !== yours.currency || base.currency !== yours.currency) {
    out.push({
      lineId: "*",
      field: "currency",
      previous: base.currency,
      theirs: theirs.currency,
      yours: yours.currency,
      proposedBy: null,
      changedBy: null,
      priceHistory: [],
    });
  }
  if ((theirs.note ?? "") !== (yours.note ?? "") && (base.note ?? "") !== (yours.note ?? "")) {
    out.push({
      lineId: "*",
      field: "note",
      previous: base.note ?? null,
      theirs: theirs.note ?? null,
      yours: yours.note ?? null,
      proposedBy: null,
      changedBy: null,
      priceHistory: [],
    });
  }

  const baseById = indexLines(base.lines);
  const theirsById = indexLines(theirs.lines);
  const yoursById = indexLines(yours.lines);
  const ids = new Set([...baseById.keys(), ...theirsById.keys(), ...yoursById.keys()]);

  for (const id of ids) {
    const prev = baseById.get(id) ?? null;
    const their = theirsById.get(id) ?? null;
    const your = yoursById.get(id) ?? null;
    // The line's author is on whichever copy carries it; the server's copy
    // is the record, the others are snapshots of it.
    const by = their?.proposedBy ?? your?.proposedBy ?? prev?.proposedBy ?? null;
    if (!prev && their && !your) continue;
    if (!prev && !their && your) {
      out.push(row(id, "added", null, null, your.label, by));
      continue;
    }
    if (prev && their && !your) {
      out.push(row(id, "removed", prev.label, their.label, null, by));
      continue;
    }
    if (prev && !their && your) {
      out.push(row(id, "removed", prev.label, null, your.label, by));
      continue;
    }
    if (their && your) {
      if (their.label !== your.label && prev?.label !== your.label) {
        out.push(row(id, "label", prev?.label ?? null, their.label, your.label, by));
      }
      if (their.units !== your.units && prev?.units !== your.units) {
        out.push(row(id, "units", prev?.units ?? null, their.units, your.units, by));
      }
      if (their.unitCents !== your.unitCents && prev?.unitCents !== your.unitCents) {
        out.push(row(id, "unitCents", prev?.unitCents ?? null, their.unitCents, your.unitCents, by));
      }
    }
  }
  return out;
}

function indexLines(lines: readonly DraftLine[]): Map<string, DraftLine> {
  const map = new Map<string, DraftLine>();
  for (const line of lines) map.set(line.id, line);
  return map;
}

function row(
  lineId: string,
  field: DraftDiffLine["field"],
  previous: string | number | null,
  theirs: string | number | null,
  yours: string | number | null,
  proposedBy: LineAuthor | null,
): DraftDiffLine {
  return { lineId, field, previous, theirs, yours, proposedBy, changedBy: null, priceHistory: [] };
}
