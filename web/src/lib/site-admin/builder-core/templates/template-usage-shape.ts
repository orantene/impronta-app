/**
 * template-usage-shape.ts — pure shape helpers for the D7 template-usage tally.
 *
 * Kept free of any Supabase / server import so the aggregation logic
 * (`aggregateTemplateUsage`) is unit-testable without a DB client (mirrors
 * `builder-lab-audit-shape.ts`). The "use server" action file
 * (`template-usage-actions.ts`) imports these to map raw rows → per-template
 * adoption totals.
 */

/** One raw `builder_template_usage` row, as selected by the read action. */
export interface BuilderTemplateUsageRow {
  template_id: string;
  tenant_id: string | null;
}

/** Per-template adoption totals shown on a Template Manager card. */
export interface TemplateUsageTotals {
  /** Total times this template was applied (row count). */
  appliedCount: number;
  /** Distinct tenants that applied it (null tenant_id is ignored). */
  tenantCount: number;
}

/**
 * Aggregate raw usage rows → a `template_id → {appliedCount, tenantCount}` map.
 *
 * PURE. `appliedCount` is the row count for the template; `tenantCount` is the
 * number of DISTINCT non-null `tenant_id`s (an anonymous/unresolved insert with
 * a null tenant_id still counts toward `appliedCount` but not `tenantCount`).
 */
export function aggregateTemplateUsage(
  rows: ReadonlyArray<BuilderTemplateUsageRow>,
): Map<string, TemplateUsageTotals> {
  const counts = new Map<string, number>();
  const tenants = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.template_id) continue;
    counts.set(row.template_id, (counts.get(row.template_id) ?? 0) + 1);
    if (row.tenant_id) {
      let set = tenants.get(row.template_id);
      if (!set) {
        set = new Set<string>();
        tenants.set(row.template_id, set);
      }
      set.add(row.tenant_id);
    }
  }

  const totals = new Map<string, TemplateUsageTotals>();
  for (const [templateId, appliedCount] of counts) {
    totals.set(templateId, {
      appliedCount,
      tenantCount: tenants.get(templateId)?.size ?? 0,
    });
  }
  return totals;
}

/**
 * One row from the `builder_template_usage_totals()` SECURITY-DEFINER RPC
 * (P3 — server-side `count(*) … group by template_id`). PostgREST returns
 * `bigint` aggregates as either a number or a numeric STRING, so the counts are
 * typed `number | string` and coerced by {@link aggregateUsageTotalsRows}.
 */
export interface BuilderTemplateUsageTotalsRow {
  template_id: string;
  applied_count: number | string;
  tenant_count: number | string;
}

/** Coerce a PostgREST bigint (number or numeric string) to a finite number; a
 *  non-numeric / NaN value folds to 0. */
function coerceCount(n: number | string): number {
  const num = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(num) ? num : 0;
}

/**
 * Map the pre-aggregated `builder_template_usage_totals()` RPC rows → the same
 * `template_id → {appliedCount, tenantCount}` map shape `aggregateTemplateUsage`
 * produces (PURE — no DB, no I/O). The RPC already did the `count(*)` /
 * `count(distinct tenant_id)` group-by server-side, so this just renames columns
 * and coerces the bigint-as-string counts. Rows with a missing `template_id` are
 * skipped; empty input → empty map.
 */
export function aggregateUsageTotalsRows(
  rows: ReadonlyArray<BuilderTemplateUsageTotalsRow>,
): Map<string, TemplateUsageTotals> {
  const totals = new Map<string, TemplateUsageTotals>();
  for (const row of rows) {
    if (!row.template_id) continue;
    totals.set(row.template_id, {
      appliedCount: coerceCount(row.applied_count),
      tenantCount: coerceCount(row.tenant_count),
    });
  }
  return totals;
}

/**
 * Render the per-card adoption line. Returns null when the template has never
 * been applied (the card then shows nothing rather than "applied 0 times").
 */
export function formatTemplateAdoption(
  totals: TemplateUsageTotals | undefined,
): string | null {
  if (!totals || totals.appliedCount <= 0) return null;
  const times = totals.appliedCount === 1 ? "time" : "times";
  const tenants = totals.tenantCount === 1 ? "tenant" : "tenants";
  return `Applied ${totals.appliedCount} ${times} across ${totals.tenantCount} ${tenants}`;
}
