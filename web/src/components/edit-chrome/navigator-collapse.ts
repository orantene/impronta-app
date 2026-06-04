/**
 * Navigator progressive-disclosure — pure, depth-based collapse logic for the
 * layers tree.
 *
 * Job: the layers tree renders a section's descendants as a flat, pre-order
 * list (each row carries a `depth`, 1-based off the section root). Fully
 * expanded that's an overwhelming 7-deep wall. This module collapses it to a
 * navigable outline: by default only depth-1 rows show, and any row that has
 * children gets a disclosure chevron to drill in.
 *
 * Why depth-based (not parent-id based): `depth` is the same value that drives
 * each row's indentation, so it is unambiguously correct for the live tree. A
 * previous parent-id implementation collapsed correctly in isolation yet showed
 * everything live; keying purely off `depth` + pre-order position removes that
 * class of mismatch. Everything here is a pure function of (rows, open-set), so
 * it is fully unit-testable without React or the section-graph.
 */

export interface NavigatorDisclosureRow {
  id: string;
  /** 1-based depth below the section root (depth-1 = a direct child). */
  depth: number;
}

export interface NavigatorDisclosureResult<Row extends NavigatorDisclosureRow> {
  /** Rows that should render given the current open-set (pre-order preserved). */
  visible: Row[];
  /** Ids of rows that have ≥1 child — these earn a disclosure chevron. */
  withChildren: Set<string>;
}

/**
 * The set of row ids that have at least one child. A row has children iff the
 * NEXT row in pre-order is deeper than it (pre-order guarantees a node's whole
 * subtree immediately follows it).
 */
export function navigatorRowsWithChildren(
  rows: readonly NavigatorDisclosureRow[],
): Set<string> {
  const withChildren = new Set<string>();
  for (let i = 0; i < rows.length; i += 1) {
    const next = rows[i + 1];
    if (next && next.depth > rows[i].depth) {
      withChildren.add(rows[i].id);
    }
  }
  return withChildren;
}

/**
 * The strict ancestor ids of `selectedId` within `rows`. Walks BACKWARD from the
 * selected row collecting the nearest preceding row at each shallower depth
 * (depth-1, depth-2, …) — those are its ancestors. Used to force-reveal the path
 * to the selected node so the operator can never select something collapse hid.
 * Returns an empty set when nothing is selected / the id isn't present.
 */
export function navigatorSelectedAncestors(
  rows: readonly NavigatorDisclosureRow[],
  selectedId: string | null | undefined,
): Set<string> {
  const path = new Set<string>();
  if (!selectedId) return path;
  const idx = rows.findIndex((r) => r.id === selectedId);
  if (idx < 0) return path;
  let wantDepth = rows[idx].depth - 1;
  for (let i = idx - 1; i >= 0 && wantDepth >= 1; i -= 1) {
    if (rows[i].depth === wantDepth) {
      path.add(rows[i].id);
      wantDepth -= 1;
    }
  }
  return path;
}

/**
 * Compute which rows render. Pre-order, depth-based: we hide every row that
 * sits below a COLLAPSED ancestor. A row that has children is collapsed unless
 * `isOpen(id)` returns true. Default (isOpen always false) reveals depth-1 only;
 * opening a row reveals exactly its direct children (which may themselves be
 * collapsed). Also returns `withChildren` so callers can render chevrons.
 */
export function computeNavigatorDisclosure<Row extends NavigatorDisclosureRow>(
  rows: readonly Row[],
  isOpen: (id: string) => boolean,
): NavigatorDisclosureResult<Row> {
  const withChildren = navigatorRowsWithChildren(rows);
  const visible: Row[] = [];
  // While we're inside a collapsed subtree, hide everything deeper than the
  // collapsed node's depth. Infinity = nothing hidden.
  let hideBelowDepth = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.depth > hideBelowDepth) {
      continue; // inside a collapsed ancestor's subtree
    }
    // depth <= hideBelowDepth → we've returned to (or above) the collapse point.
    hideBelowDepth = Number.POSITIVE_INFINITY;
    visible.push(row);
    if (withChildren.has(row.id) && !isOpen(row.id)) {
      hideBelowDepth = row.depth; // collapse this row's subtree
    }
  }
  return { visible, withChildren };
}
