/**
 * catalog-health.ts (D8) — the PURE Catalog-health analyzer.
 *
 * Builds the four triage buckets the Catalog-health strip surfaces, from data
 * already in hand on the Lab Catalog: the admin-view rows
 * (`buildCatalogAdminView` → `CatalogAdminItem[]`), the full template set
 * (`listAllTemplates` → `BuilderTemplateRow[]`), and the two usage maps —
 * D1's per-TYPE usage (carried on each row's `usageCount`) and D7's
 * template-adoption totals (`getTemplateUsageTotals`).
 *
 * The four buckets (each a list of offending rows + a count):
 *
 *   1. ORPHANED CATEGORY — a template whose `category` is not in the taxonomy
 *      (no canonical category and no code item uses it). It still renders, but
 *      under a phantom category with no structural home, so it's effectively
 *      lost in the gallery.
 *
 *   2. UNSATISFIABLE BINDING — a *connected* template whose
 *      `data_binding_requirements` reference a data source that can NEVER
 *      resolve on its `target_context`. Two ways this happens: (a) a roster-only
 *      source (`featured_talent_profiles` / `tenant_directory_search` /
 *      `talent_locations`) required by a `talent`-target template (a single
 *      talent has no roster), or (b) an unknown source key not in the
 *      data-source registry (dropped/renamed source — never resolves anywhere).
 *      Such a template is published but its bound nodes render empty → it
 *      "never appears" as intended.
 *
 *   3. DEAD WEIGHT — a template published > `staleDays` ago with ZERO adoption
 *      (no `builder_template_usage` rows). Shipped, aged, never applied.
 *
 *   4. ASYMMETRIC SURFACE — a code/template row that is visible on ONE talent
 *      surface but not the other (profile vs shell), or one workspace surface
 *      but not the other (page vs shell). An asymmetric pair is almost always
 *      an accidental half-toggle rather than a deliberate scope.
 *
 * PURE: no I/O, no React, no "use server". Takes plain data + a clock value, so
 * the four bucket derivations are unit-testable without a DB or a render. The
 * panel (`catalog-health-panel.tsx`) calls this with the live data and renders
 * the buckets; the analyzer never imports it.
 */

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import type { CatalogSurfaceKey } from "@/lib/site-admin/add-gallery/registry-db-merge";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";
import type { TemplateUsageTotals } from "@/lib/site-admin/builder-core/templates/template-usage-shape";
import { BUILDER_DATA_SOURCE_REGISTRY } from "@/lib/site-admin/builder-node/data-bindings";
import { BUILDER_COLLECTION_SOURCE_PREFIX } from "@/lib/site-admin/builder-node/data-bindings";

// ── Inputs ────────────────────────────────────────────────────────────────────

/** Which bucket an issue belongs to (also the strip's section key). */
export type CatalogHealthBucketKey =
  | "orphaned_category"
  | "unsatisfiable_binding"
  | "dead_weight"
  | "asymmetric_surface";

/** A single offending row in a bucket. `rowId` is the catalog row id (jump
 *  target for gallery rows); `dbTemplateId` is the raw template id when the
 *  issue is template-only (route → Templates manager). */
export interface CatalogHealthIssue {
  bucket: CatalogHealthBucketKey;
  /** Catalog row id (code/template gallery id) — present when the issue maps to
   *  a row in the admin view, so a click can reuse the gallery jump. */
  rowId?: string;
  /** Gallery tab of the row, when known — lets the click pre-select the view. */
  tab?: CatalogAdminItem["tab"];
  /** Raw `builder_templates.id` when the issue is a template (route to manager
   *  if there's no gallery row). */
  dbTemplateId?: string;
  /** Human label for the offending item. */
  label: string;
  /** One-line, plain-language reason this is flagged. */
  detail: string;
}

/** One categorized bucket. */
export interface CatalogHealthBucket {
  key: CatalogHealthBucketKey;
  title: string;
  /** Short plain-language description of what the bucket flags. */
  blurb: string;
  issues: CatalogHealthIssue[];
}

export interface CatalogHealthReport {
  buckets: CatalogHealthBucket[];
  /** Total issue count across every bucket — the strip's headline number. */
  totalIssues: number;
}

export interface AnalyzeCatalogHealthInput {
  /** The full ungated admin-view rows (code ∪ templates). */
  rows: ReadonlyArray<CatalogAdminItem>;
  /** Every `builder_templates` row, all statuses. */
  templates: ReadonlyArray<BuilderTemplateRow>;
  /** D7 adoption totals keyed by raw template id. Missing key ⇒ never applied. */
  templateUsage: Readonly<Record<string, TemplateUsageTotals>>;
  /** A template published more than this many days ago with zero adoption is
   *  flagged as dead weight. Defaults to 90. */
  staleDays?: number;
  /** "Now" as epoch ms — injected so the dead-weight cutoff is deterministic in
   *  tests. Defaults to `Date.now()`. */
  nowMs?: number;
  /** Extra category ids/labels considered valid (e.g. admin-created structure
   *  categories) on top of the canonical set + code-item categories. */
  knownCategories?: ReadonlyArray<string>;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_STALE_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Data sources that require a workspace ROSTER and therefore can never resolve
 *  when a template targets a single talent (a talent owns no roster). */
const ROSTER_ONLY_SOURCES: ReadonlySet<string> = new Set([
  "featured_talent_profiles",
  "tenant_directory_search",
  "talent_locations",
]);

/** The known, resolvable data-source keys (from the registry). Anything else in
 *  a template's `data_binding_requirements` (other than a `collection:` key,
 *  which is tenant-specific and resolved at runtime) is an unknown source that
 *  never resolves. */
const KNOWN_SOURCE_KEYS: ReadonlySet<string> = new Set(
  BUILDER_DATA_SOURCE_REGISTRY.map((d) => d.key),
);

function isCollectionKey(key: string): boolean {
  return key.startsWith(BUILDER_COLLECTION_SOURCE_PREFIX);
}

// ── normalizeCategory ─────────────────────────────────────────────────────────

function normCat(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Build the set of in-taxonomy category tokens (lowercased) from the admin-view
 * rows: every CODE row's effective AND base category is canonical (code items
 * are placed by the registry), plus any explicitly-supplied `knownCategories`.
 * A template whose category is outside this set is orphaned.
 */
function knownCategorySet(input: AnalyzeCatalogHealthInput): Set<string> {
  const set = new Set<string>();
  for (const row of input.rows) {
    if (row.source !== "code") continue;
    const base = normCat(row.baseCategory);
    const eff = normCat(row.effectiveCategory);
    if (base) set.add(base);
    if (eff) set.add(eff);
  }
  for (const c of input.knownCategories ?? []) {
    const n = normCat(c);
    if (n) set.add(n);
  }
  return set;
}

// ── Bucket 1: orphaned category ───────────────────────────────────────────────

function orphanedCategoryIssues(
  input: AnalyzeCatalogHealthInput,
): CatalogHealthIssue[] {
  const known = knownCategorySet(input);
  const issues: CatalogHealthIssue[] = [];
  // Index template rows in the admin view by dbTemplateId so we can resolve a
  // gallery jump target where one exists.
  const rowByDbId = new Map<string, CatalogAdminItem>();
  for (const row of input.rows) {
    if (row.source === "template" && row.dbTemplateId) {
      rowByDbId.set(row.dbTemplateId, row);
    }
  }
  for (const t of input.templates) {
    const cat = normCat(t.category);
    // A blank category is its own (separate) problem; orphan = a non-empty
    // category that simply isn't in the taxonomy.
    if (!cat) continue;
    if (known.has(cat)) continue;
    const galleryRow = rowByDbId.get(t.id);
    issues.push({
      bucket: "orphaned_category",
      rowId: galleryRow?.id,
      tab: galleryRow?.tab,
      dbTemplateId: t.id,
      label: t.title,
      detail: `Category "${t.category}" is not in the taxonomy`,
    });
  }
  return issues;
}

// ── Bucket 2: unsatisfiable binding ───────────────────────────────────────────

/** The reason (if any) a single data-source key is unsatisfiable for a target. */
function unsatisfiableReason(
  sourceKey: string,
  target: BuilderTemplateRow["target_context"],
): string | null {
  if (isCollectionKey(sourceKey)) return null; // tenant-specific; resolved live
  if (!KNOWN_SOURCE_KEYS.has(sourceKey)) {
    return `unknown data source "${sourceKey}"`;
  }
  if (target === "talent" && ROSTER_ONLY_SOURCES.has(sourceKey)) {
    return `"${sourceKey}" needs a workspace roster, which a talent target has none of`;
  }
  return null;
}

function unsatisfiableBindingIssues(
  input: AnalyzeCatalogHealthInput,
): CatalogHealthIssue[] {
  const issues: CatalogHealthIssue[] = [];
  const rowByDbId = new Map<string, CatalogAdminItem>();
  for (const row of input.rows) {
    if (row.source === "template" && row.dbTemplateId) {
      rowByDbId.set(row.dbTemplateId, row);
    }
  }
  for (const t of input.templates) {
    const reqs = t.data_binding_requirements ?? [];
    if (reqs.length === 0) continue;
    const reasons: string[] = [];
    for (const key of reqs) {
      const reason = unsatisfiableReason(String(key), t.target_context);
      if (reason) reasons.push(reason);
    }
    if (reasons.length === 0) continue;
    const galleryRow = rowByDbId.get(t.id);
    issues.push({
      bucket: "unsatisfiable_binding",
      rowId: galleryRow?.id,
      tab: galleryRow?.tab,
      dbTemplateId: t.id,
      label: t.title,
      detail: reasons.join("; "),
    });
  }
  return issues;
}

// ── Bucket 3: dead weight (published > N days, zero adoption) ──────────────────

function deadWeightIssues(
  input: AnalyzeCatalogHealthInput,
): CatalogHealthIssue[] {
  const staleDays = input.staleDays ?? DEFAULT_STALE_DAYS;
  const nowMs = input.nowMs ?? Date.now();
  const cutoff = nowMs - staleDays * MS_PER_DAY;
  const issues: CatalogHealthIssue[] = [];
  const rowByDbId = new Map<string, CatalogAdminItem>();
  for (const row of input.rows) {
    if (row.source === "template" && row.dbTemplateId) {
      rowByDbId.set(row.dbTemplateId, row);
    }
  }
  for (const t of input.templates) {
    if (t.status !== "published") continue;
    if (!t.published_at) continue;
    const publishedMs = Date.parse(t.published_at);
    if (!Number.isFinite(publishedMs)) continue;
    if (publishedMs > cutoff) continue; // recent enough
    const totals = input.templateUsage[t.id];
    if (totals && totals.appliedCount > 0) continue; // adopted
    const ageDays = Math.floor((nowMs - publishedMs) / MS_PER_DAY);
    const galleryRow = rowByDbId.get(t.id);
    issues.push({
      bucket: "dead_weight",
      rowId: galleryRow?.id,
      tab: galleryRow?.tab,
      dbTemplateId: t.id,
      label: t.title,
      detail: `Published ${ageDays}d ago, never applied`,
    });
  }
  return issues;
}

// ── Bucket 4: asymmetric surface visibility ───────────────────────────────────

const TALENT_PAIR: readonly [CatalogSurfaceKey, CatalogSurfaceKey] = [
  "talent_profile",
  "talent_shell",
];
const WORKSPACE_PAIR: readonly [CatalogSurfaceKey, CatalogSurfaceKey] = [
  "workspace_page",
  "workspace_shell",
];

function asymmetricSurfaceIssues(
  input: AnalyzeCatalogHealthInput,
): CatalogHealthIssue[] {
  const issues: CatalogHealthIssue[] = [];
  for (const row of input.rows) {
    const sv = row.surfaceVisible;
    if (!sv) continue;
    const mismatches: string[] = [];
    if (sv[TALENT_PAIR[0]] !== sv[TALENT_PAIR[1]]) {
      mismatches.push(
        `talent: ${sv[TALENT_PAIR[0]] ? "profile on, shell off" : "shell on, profile off"}`,
      );
    }
    if (sv[WORKSPACE_PAIR[0]] !== sv[WORKSPACE_PAIR[1]]) {
      mismatches.push(
        `workspace: ${sv[WORKSPACE_PAIR[0]] ? "page on, shell off" : "shell on, page off"}`,
      );
    }
    if (mismatches.length === 0) continue;
    issues.push({
      bucket: "asymmetric_surface",
      rowId: row.id,
      tab: row.tab,
      dbTemplateId: row.dbTemplateId,
      label: row.effectiveLabel || row.baseLabel,
      detail: mismatches.join("; "),
    });
  }
  return issues;
}

// ── Public entry ──────────────────────────────────────────────────────────────

const BUCKET_META: Record<
  CatalogHealthBucketKey,
  { title: string; blurb: string }
> = {
  orphaned_category: {
    title: "Orphaned category",
    blurb: "Template filed under a category not in the taxonomy.",
  },
  unsatisfiable_binding: {
    title: "Unsatisfiable binding",
    blurb: "Connected template whose data source can't resolve on its target.",
  },
  dead_weight: {
    title: "Dead weight",
    blurb: "Published long ago, never applied by any tenant.",
  },
  asymmetric_surface: {
    title: "Asymmetric surface",
    blurb: "Shown on one surface of a pair but not the other.",
  },
};

/**
 * Analyze the Catalog and return the four triage buckets. PURE.
 */
export function analyzeCatalogHealth(
  input: AnalyzeCatalogHealthInput,
): CatalogHealthReport {
  const byBucket: Record<CatalogHealthBucketKey, CatalogHealthIssue[]> = {
    orphaned_category: orphanedCategoryIssues(input),
    unsatisfiable_binding: unsatisfiableBindingIssues(input),
    dead_weight: deadWeightIssues(input),
    asymmetric_surface: asymmetricSurfaceIssues(input),
  };
  const order: CatalogHealthBucketKey[] = [
    "orphaned_category",
    "unsatisfiable_binding",
    "dead_weight",
    "asymmetric_surface",
  ];
  const buckets: CatalogHealthBucket[] = order.map((key) => ({
    key,
    title: BUCKET_META[key].title,
    blurb: BUCKET_META[key].blurb,
    issues: byBucket[key],
  }));
  const totalIssues = buckets.reduce((n, b) => n + b.issues.length, 0);
  return { buckets, totalIssues };
}
