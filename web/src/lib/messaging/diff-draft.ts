export type DraftLine = {
  id: string;
  offeringId?: string | null;
  label: string;
  units: number;
  unitCents: number;
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
};

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
    });
  }
  if ((theirs.note ?? "") !== (yours.note ?? "") && (base.note ?? "") !== (yours.note ?? "")) {
    out.push({
      lineId: "*",
      field: "note",
      previous: base.note ?? null,
      theirs: theirs.note ?? null,
      yours: yours.note ?? null,
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
    if (!prev && their && !your) continue;
    if (!prev && !their && your) {
      out.push(row(id, "added", null, null, your.label));
      continue;
    }
    if (prev && their && !your) {
      out.push(row(id, "removed", prev.label, their.label, null));
      continue;
    }
    if (prev && !their && your) {
      out.push(row(id, "removed", prev.label, null, your.label));
      continue;
    }
    if (their && your) {
      if (their.label !== your.label && prev?.label !== your.label) {
        out.push(row(id, "label", prev?.label ?? null, their.label, your.label));
      }
      if (their.units !== your.units && prev?.units !== your.units) {
        out.push(row(id, "units", prev?.units ?? null, their.units, your.units));
      }
      if (their.unitCents !== your.unitCents && prev?.unitCents !== your.unitCents) {
        out.push(row(id, "unitCents", prev?.unitCents ?? null, their.unitCents, your.unitCents));
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
): DraftDiffLine {
  return { lineId, field, previous, theirs, yours };
}
