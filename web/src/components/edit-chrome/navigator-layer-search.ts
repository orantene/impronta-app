/**
 * Unified layer search — sections, builder children, and freeform tree rows.
 */

import {
  BUILDER_NODE_REGISTRY,
  type BuilderNodeKind,
} from "@/lib/site-admin/builder-node";

export interface FreeformLayerSearchRow {
  id: string;
  label: string;
  kind: BuilderNodeKind;
  role?: string | null;
  sectionTypeKey?: string | null;
}

export function builderNodeRowMatchesSearch(
  row: FreeformLayerSearchRow,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const kindLabel = BUILDER_NODE_REGISTRY[row.kind].label.toLowerCase();
  return (
    row.label.toLowerCase().includes(q) ||
    row.kind.toLowerCase().includes(q) ||
    kindLabel.includes(q) ||
    (row.role ?? "").toLowerCase().includes(q) ||
    (row.sectionTypeKey ?? "").toLowerCase().includes(q) ||
    (row.sectionTypeKey ?? "").replace(/_/g, " ").toLowerCase().includes(q)
  );
}

/** Filter rows + keep ancestors of matches visible. */
export function filterFreeformRowsWithAncestors<
  T extends { id: string; depth: number; label: string; kind: BuilderNodeKind; role?: string | null },
>(
  rows: readonly T[],
  query: string,
  sectionTypeKeyForRow?: (row: T) => string | null,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];

  const matchIds = new Set<string>();
  for (const row of rows) {
    if (
      builderNodeRowMatchesSearch(
        {
          id: row.id,
          label: row.label,
          kind: row.kind,
          role: row.role,
          sectionTypeKey: sectionTypeKeyForRow?.(row) ?? null,
        },
        q,
      )
    ) {
      matchIds.add(row.id);
    }
  }

  if (matchIds.size === 0) return [];

  const ancestorIds = new Set<string>();
  for (const row of rows) {
    if (!matchIds.has(row.id)) continue;
    let wantDepth = row.depth - 1;
    const idx = rows.indexOf(row);
    for (let i = idx - 1; i >= 0 && wantDepth >= 0; i -= 1) {
      if (rows[i].depth === wantDepth) {
        ancestorIds.add(rows[i].id);
        wantDepth -= 1;
      }
    }
  }

  const visible = new Set([...matchIds, ...ancestorIds]);
  return rows.filter((r) => visible.has(r.id));
}
