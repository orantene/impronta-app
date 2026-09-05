/**
 * plan-import.ts — the dry run, as data.
 *
 * THE PLAN IS THE DELIVERABLE, not a flag on the writer. 117 rows is far past
 * the point where a person can audit a silent bulk write, and an importer that
 * half-succeeds is worse than one that refuses: the operator cannot tell which
 * half. So parsing produces a plan, a human reads it, and only then does
 * anything write.
 *
 * Pure. Existing rows in, plan out, no I/O — so the decision of what WOULD
 * happen is testable without a database, which is the only way to test it
 * honestly.
 *
 * IDEMPOTENT BY SOURCE ID. Every row carries `attributes.source_id` of
 * `restauradmin:<product-id>`. A re-import UPDATES those and creates only what
 * is genuinely new. Without it a second run mints a second 117 and the board has
 * two of everything — a failure nobody notices until a customer sees it.
 */

import type { ImportedItem, ImportedMenu } from "./parse-restauradmin";

export const SOURCE_ID_KEY = "source_id";

/** The shape the planner needs from an offering already in the workspace. */
export type ExistingOffering = {
  id: string;
  title: string;
  amountCents: number | null;
  currency: string;
  category: string | null;
  attributes: Record<string, unknown> | null;
};

export type PlannedAction = "create" | "update" | "unchanged";

export type PlannedRow = {
  action: PlannedAction;
  sourceId: string;
  /** The existing offering this updates. Null for a create. */
  offeringId: string | null;
  title: string;
  category: string;
  /** Null when every price is a tier — the board must not show a buyable price that is not. */
  amountCents: number | null;
  currency: string;
  variantCount: number;
  addOnCount: number;
  hasImage: boolean;
  /** Field names that differ from the existing row. Empty for create/unchanged. */
  changes: string[];
};

export type ImportPlan = {
  currency: string;
  rows: PlannedRow[];
  /** Carried through from the parse so one screen shows everything. */
  refused: ImportedMenu["refused"];
  /** Existing imported rows the new file no longer contains. NEVER auto-deleted. */
  orphans: Array<{ offeringId: string; sourceId: string; title: string }>;
  counts: {
    create: number;
    update: number;
    unchanged: number;
    refused: number;
    orphans: number;
    categories: number;
    withVariants: number;
    withImage: number;
  };
};

function sourceIdOf(row: ExistingOffering): string | null {
  const attrs = row.attributes;
  if (!attrs || typeof attrs !== "object") return null;
  const v = (attrs as Record<string, unknown>)[SOURCE_ID_KEY];
  return typeof v === "string" && v ? v : null;
}

/** Which fields of an existing row this import would change. */
function diff(item: ImportedItem, row: ExistingOffering): string[] {
  const changed: string[] = [];
  const nextTitle = item.title.es || item.title.en;
  if (nextTitle !== row.title) changed.push("title");
  if (item.amountCents !== row.amountCents) changed.push("price");
  if (item.currency !== row.currency) changed.push("currency");
  if (item.category !== (row.category ?? "")) changed.push("category");
  return changed;
}

/**
 * Build the plan a human approves.
 *
 * `existing` is every offering already in the workspace, imported or not. Rows
 * WITHOUT a source id are ignored entirely: a menu item somebody typed by hand
 * is not something an import may claim, rename or overwrite. Matching on title
 * would do exactly that, silently, to the rows an operator cared most about.
 */
export function planMenuImport(
  menu: ImportedMenu,
  existing: ReadonlyArray<ExistingOffering>,
): ImportPlan {
  const bySource = new Map<string, ExistingOffering>();
  for (const row of existing) {
    const sid = sourceIdOf(row);
    if (sid) bySource.set(sid, row);
  }

  const rows: PlannedRow[] = [];
  const seen = new Set<string>();

  for (const item of menu.items) {
    seen.add(item.sourceId);
    const match = bySource.get(item.sourceId);
    const base = {
      sourceId: item.sourceId,
      title: item.title.es || item.title.en,
      category: item.category,
      amountCents: item.amountCents,
      currency: item.currency,
      variantCount: item.variants.length,
      addOnCount: item.addOns.length,
      hasImage: Boolean(item.imageUrl),
    };

    if (!match) {
      rows.push({ ...base, action: "create", offeringId: null, changes: [] });
      continue;
    }
    const changes = diff(item, match);
    rows.push({
      ...base,
      action: changes.length > 0 ? "update" : "unchanged",
      offeringId: match.id,
      changes,
    });
  }

  // Previously imported rows the new file dropped. REPORTED, NEVER DELETED: a
  // restaurant that takes a dish off the menu still has orders referencing it,
  // and an importer that deletes on absence turns a menu edit into data loss.
  const orphans = [...bySource.entries()]
    .filter(([sid]) => !seen.has(sid))
    .map(([sid, row]) => ({ offeringId: row.id, sourceId: sid, title: row.title }));

  return {
    currency: menu.currency,
    rows,
    refused: menu.refused,
    orphans,
    counts: {
      create: rows.filter((r) => r.action === "create").length,
      update: rows.filter((r) => r.action === "update").length,
      unchanged: rows.filter((r) => r.action === "unchanged").length,
      refused: menu.refused.length,
      orphans: orphans.length,
      categories: new Set(rows.map((r) => r.category)).size,
      withVariants: rows.filter((r) => r.variantCount > 0).length,
      withImage: rows.filter((r) => r.hasImage).length,
    },
  };
}

/** Nothing to do. Shown instead of a confirm button, so a no-op cannot look like a run. */
export function planIsEmpty(plan: ImportPlan): boolean {
  return plan.counts.create === 0 && plan.counts.update === 0;
}
